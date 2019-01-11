var parse_feeds = null;
var request = null;
var fs = require('fs');

const config = require('dotenv').config({
  path: __dirname + "/.env"
});

function is_member_account(member, id, site) {
  if (!member || !member.accounts)
    return false;

  for (var i = 0; i < member.accounts.length; i++) {
    if (site !== "periscope" || member.accounts[i].site !== "twitter") {
      if (member.accounts[i].site !== site)
        continue;
    }

    if (member.accounts[i].username.toLowerCase() === id.toLowerCase())
      return member.accounts[i];
  }

  return false;
}

var followers_low = 4000;
var followers_high = 1*1000*1000;

var time_low = 2*60*60*1000;
var time_high = 14*24*60*60*1000;

function sinterpolate(value) {
  return (Math.sin(Math.pow(value, 2/6)*Math.PI - Math.PI/2) + 1) / 2;
}

function interpolate(value_low, value_high, input_low, input_high, input) {
  input = Math.max(0, input - input_low);
  var range = (input_high - input_low);
  //input = Math.min(1, Math.pow(input, 1/3) / Math.pow(range, 1/3));
  //input = Math.min(1, Math.pow(input, 2) / Math.pow(range, 2));
  input = Math.min(1, input / range);
  input = sinterpolate(input);

  return value_low + (value_high - value_low) * (1 - input);
}

function get_properties(account) {
  var desc = account.obj.description;
  if (!desc)
    return null;

  var desc_info = desc.replace(/^[\s\S]*\n---\n/, "");
  if (desc_info != desc) {
    var desc_properties = {};
    while (true) {
      var current_desc = desc_info.replace(/^(.*)[\s\S]*?$/, "$1");
      if (!current_desc)
        break;

      var property = current_desc.replace(/^(.*?): *(.*)[\s\S]*?$/, "$1");
      var value = current_desc.replace(/^(.*?): *(.*)[\s\S]*?$/, "$2");

      desc_properties[property.toLowerCase()] = value;

      var new_desc_info = desc_info.replace(/^.*\n(.*)$/, "$1");
      if (!new_desc_info || new_desc_info === desc_info)
        break;
      desc_info = new_desc_info;
    }

    return desc_properties;
  }

  return null;
}

function can_share(member, account) {
  if (!member || member.family)
    return false;

  if (member.bot_whitelist === true) {
    return true;
  }


  var properties = get_properties(account);
  if (properties) {
    if (properties.followers !== undefined) {
      var followers = parseInt(properties.followers);
      if (followers < followers_low)
        return false;

      var delay = interpolate(time_low, time_high, followers_low, followers_high, followers);
      if (isNaN(delay))
        return false;

      var added_at = account.obj.added_at;
      //console.log(added_at);
      if (added_at) {
        var diff = Date.now() - added_at;
        //console.log(diff, delay);
        if (diff <= time_low || diff < delay)
          return false;
      }

      if (followers > 200*1000 && member.member_name && !member.member_name.startsWith("@"))
        return true;
    }
  }

  if ((member.group && member.category !== "외") ||
      member.nogroup === "가수" ||
      (member.category && member.category.startsWith("그룹"))) {
    return true;
  }

  return false;
}

/*process.stdin.setEncoding('utf8');
var input_chunks = [];

process.stdin.on('readable', function() {
  const chunk = process.stdin.read();
  if (chunk !== null)
    input_chunks.push(chunk);
});*/

function main(members, options) {
  var username = options.username;
  var site = options.site;

  for (var i = 0; i < members.length; i++) {
    var member = members[i];
    var account = null;
    if (!member || !(account = is_member_account(member, username, site)) || !can_share(member, account))
      continue;

    //console.log(member);
    var properties = get_properties(account);
    var result = {
      type: options.type,
      site: options.site,
      username: account.username,
      //member_type: "group_member",
      group: member.group_romans,
      group_kr: member.group,
      profile_link: account.link,
      watch_link: account.link,
      name: member.title,
      name_kr: member.title_kr,
      names: member.names,
      nicks: member.nicks,
      member_name: member.member_name,
      member_name_kr: member.member_name_kr,
      noupload: member.noupload,
      group_noupload: member.group_noupload
    };

    if (options.guid) {
      result.broadcast_guid = options.guid;
    }

    if (options.time) {
      result.date = options.time;
    }

    if (properties) {
      result.uid = properties.uid;
    }

    if (options.video_title) {
      result.video_title = options.video_title;
    }

    if (member.alt_groups) {
      result.alt_groups = member.alt_groups;
    }

    if (member.alt_groups_roman) {
      result.alt_groups_roman = member.alt_groups_roman;
    }

    //console.log(result);

    request.post({
      uri: 'http://localhost:8456/add',
      method: 'POST',
      json: result
    });
  }
}

function init_main(cb) {
  if (!parse_feeds)
    parse_feeds = require('./parse_feeds');
  if (!request)
    request = require('request');

  parse_feeds.parse_feeds().then(cb);
}

function do_main_loop(members, items) {
  for (var i = 0; i < items.length; i++) {
    main(members, items[i]);
  }
}

function start_add(items) {
  if (items.length === 0)
    return;

  init_main((members) => {
    do_main_loop(members, items);
  });
}

function process_lives(parsed) {
  var lives = [];
  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];
    if (entry.caption !== "[LIVE]")
      continue;

    var guid = entry.url.match(/^https?:\/\/guid\.instagram\.com\/([0-9]+_[0-9]+)$/);
    if (!guid)
      continue;
    guid = guid[1];

    lives.push({
      type: "live",
      guid,
      site: "instagram",
      username: entry.author,
      time: entry.date * 1000
    });
  }

  start_add(lives);
}

function process_replays(parsed) {
  //console.log(parsed);
  var replays = [];

  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];

    if (!entry.caption.match(/Instagram Live *[0-9]* *\[[0-9]{6}\] *$/)) {
      continue;
    }

    var username = entry.description.match(/^Instagram: https?:\/\/[^/]*\/([^/]*)\/? *$/m);
    if (!username)
      continue;

    username = username[1];

    replays.push({
      type: "replay",
      guid: entry.url,
      site: "instagram",
      username: username,
      time: entry.date * 1000,
      video_title: entry.caption
    });
  }

  start_add(replays);
}

function process_add_account() {
  if (process.argv.length < 4)
    return;

  var accountname = process.argv[3];
  if (!accountname)
    return;

  var readlineSync = require('readline-sync');

  init_main((members) => {
    var accounts = [];

    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member)
        continue;

      if (member.group !== accountname &&
          member.member_name_kr !== accountname)
        continue;

      for (var j = 0; j < member.accounts.length; j++) {
        var account = member.accounts[j];

        if (account.site !== "instagram")
          continue;

        var text = member.title + " @" + account.username;
        if (readlineSync.keyInYNStrict(text)) {
          accounts.push({
            type: "account",
            site: "instagram",
            username: account.username
          });
        }
      }
    }

    console.log(accounts);
    if (!readlineSync.keyInYNStrict("Is this acceptable?")) {
      return;
    }

    do_main_loop(members, accounts);
  });
}

function process_accept_guild() {
  request = require('request');

  var action = null;

  if (!process.argv[3] || !process.argv[4] || !process.argv[4].match(/^[0-9]+$/))
    return;

  if (process.argv[3] === "whitelist") {
    action = {
      type: "whitelist",
      guild_id: process.argv[4]
    };
  } else if (process.argv[3] === "blacklist") {
    action = {
      type: "blacklist",
      guild_id: process.argv[4]
    };
  }

  if (action) {
    request.post({
      uri: 'http://localhost:8456/guild',
      method: 'POST',
      json: action
    });
  }
}

function process_delete() {
  if (!process.argv[3] || !process.argv[4])
    return;

  var action = null;

  if (process.argv[3] === "replay") {
    if (!process.argv[4].match(/^https?:\/\/youtu/))
      return;

    action = {
      type: "message",
      broadcast_guid: process.argv[4],
      message_type: process.argv[3]
    };
  }

  if (action) {
    request = require('request');
    request.post({
      uri: 'http://localhost:8456/delete',
      method: 'POST',
      json: action
    }, function() {
      var readlineSync = require('readline-sync');
      if (!readlineSync.keyInYNStrict("Really delete?")) {
        return;
      }

      action.confirm = true;
      request.post({
        uri: 'http://localhost:8456/delete',
        method: 'POST',
        json: action
      });
    });
  }
}

function start() {
  if (process.argv.length > 2) {
    if (process.argv[2] === "account") {
      process_add_account();
      return;
    } else if (process.argv[2] === "guild") {
      process_accept_guild();
      return;
    } else if (process.argv[2] === "delete") {
      return process_delete();
    }
  }

  var input = fs.readFileSync('/dev/stdin').toString();

//process.stdin.on('end', function() {
  //var input = input_chunks.join();

  var parsed;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return;
  }

  if (parsed.url === "https://reelstray.instagram.com/") {
    return process_lives(parsed);
  }

  if (parsed.config.fullpath.startsWith("/f/youtube/playlist/" + config.parsed.YOUTUBE_PLAYLIST_ID)) {
    return process_replays(parsed);
  }

  //console.log(parsed);


}

start();
