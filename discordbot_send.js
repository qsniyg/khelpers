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
    if (member.accounts[i].site !== site)
      continue;

    if (site === "instagram" ||
        site === "twitter" ||
        site === "periscope" ||
        site === "afreecatv" ||
        site === "goldlive") {
      if (member.accounts[i].username.toLowerCase() === id.toLowerCase())
        return member.accounts[i];
    } else {
      if (member.accounts[i].username === id)
        return member.accounts[i];
    }
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
  if (!account.obj)
    return null;

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

      var new_desc_info = desc_info.replace(/^.*\n([\s\S]*)$/, "$1");
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

  if (account.site !== "instagram")
    return true;

  //if (member.bot_whitelist === true) {
  if (account.bot_whitelist === true || !account.obj) {
    return true;
  }

  if (account.bot_whitelist === false)
    return false;


  var properties = get_properties(account);
  if (properties) {
    if (properties.followers !== undefined) {
      var followers = parseInt(properties.followers);
      if (followers < followers_low)
        return false;

      var delay = interpolate(time_low, time_high, followers_low, followers_high, followers);
      if (isNaN(delay))
        return false;

      if (!account.obj)
        return true;

      var added_at = account.obj.added_at;
      //console.log(added_at);
      if (added_at) {
        var diff = Date.now() - added_at;
        //console.log(diff, delay);
        //console.log((diff - delay) / 1000 / 60 / 60 / 24);
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

function get_member_and_account(members, options) {
  var username = options.username;
  var site = options.site;

  for (var i = 0; i < members.length; i++) {
    var member = members[i];
    var account = null;
    if (!member || !(account = is_member_account(member, username, site)))
      continue;

    if (!can_share(member, account))
      return null;

    return {
      member,
      account
    };
  }

  return null;
}

function new_main(members, options) {
  var ma = get_member_and_account(members, options);
  if (!ma)
    return;

  var coauthors = [];
  if (options.coauthors) {
    for (var i = 0; i < options.coauthors.length; i++) {
      var coauthor_ma = get_member_and_account(members, {
        username: options.coauthors[i],
        site: options.site
      });

      if (!coauthor_ma)
        continue;

      coauthors.push({
        username: coauthor_ma.account.username,
        group: coauthor_ma.member.group_romans,
        group_kr: coauthor_ma.member.group,
        name: coauthor_ma.member.title,
        name_kr: coauthor_ma.member.title_kr,
        names: coauthor_ma.member.names,
        nicks: coauthor_ma.member.nicks,
        member_name: coauthor_ma.member.member_name,
        member_name_kr: coauthor_ma.member.member_name_kr,
        noupload: coauthor_ma.member.noupload,
        group_noupload: coauthor_ma.member.group_noupload
      });
    }
  }

  var member = ma.member;
  var account = ma.account;

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
    group_noupload: member.group_noupload,
    coauthors: coauthors
  };

  if (options.guid) {
    result.broadcast_guid = options.guid;
  }

  if (options.watch_link) {
    result.watch_link = options.watch_link;
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

  if (options.embedded_media) {
    result.embedded_media = options.embedded_media;
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

function init_main(cb) {
  if (!parse_feeds)
    parse_feeds = require('./parse_feeds');
  if (!request)
    request = require('request');

  parse_feeds.parse_feeds().then(cb);
}

function do_main_loop(members, items) {
  for (var i = 0; i < items.length; i++) {
    new_main(members, items[i]);
  }
}

function start_add(items) {
  if (!items || items.length === 0)
    return;

  var new_items = [];
  for (var i = 0; i < items.length; i++) {
    var found = false;
    for (var j = 0; j < new_items.length; j++) {
      if (items[i].site && new_items[j].site &&
          items[i].site !== new_items[j].site)
        continue;

      if (items[i].guid && new_items[j].guid &&
          items[i].guid !== new_items[j].guid)
        continue;

      found = true;
      break;
    }

    if (!found)
      new_items.push(items[i]);
  }

  init_main((members) => {
    do_main_loop(members, new_items);
  });
}

function process_lives(parsed) {
  var lives = [];
  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];
    if (!entry.caption ||
        entry.caption !== "[LIVE]" &&
        !entry.caption.startsWith("[LIVE] "))
      continue;

    var site;
    var watch_link;
    var guid = entry.url.match(/^https?:\/\/guid\.instagram\.com\/([0-9]+_[0-9]+)$/);
    if (guid) {
      site = "instagram";
    } else if (guid = entry.url.match(/^https?:\/\/(?:www\.)?periscope\.tv\/[^/]*\/+([^/]*)$/)) {
      site = "periscope";
      watch_link = entry.url;
    } else if (guid = entry.url.match(/^https?:\/\/(?:www\.)?youtu\.be\/([^/]*)$/)) {
      site = "youtube";
      watch_link = entry.url;
    } else if (guid = entry.url.match(/^https?:\/\/play\.afreecatv\.com\/([^/]*\/[0-9]+)$/)) {
      site = "afreecatv";
      watch_link = entry.url;
    } else if (guid = entry.url.match(/^https?:\/\/player\.goldlive\.co\.kr\/play\/([0-9]+)$/)) {
      site = "goldlive";
      watch_link = entry.url;
    } else {
      continue;
    }

    guid = guid[1];

    lives.push({
      type: "live",
      guid,
      site,
      watch_link,
      username: entry.author,
      coauthors: entry.coauthors,
      time: entry.date * 1000
    });
  }

  start_add(lives);
}

function process_entries(parsed) {
  var entries = [];
  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];
    var type = "post";
    var watch_link = entry.url;

    if (entry.caption) {
      if (entry.caption === "[LIVE]" ||
          entry.caption.startsWith("[LIVE] ")) {
        type = "live";
        watch_link = undefined;
      } else if (entry.caption === "[STORY]" ||
                 entry.caption.startsWith("[STORY] ")) {
        type = "story";
      }
    }

    // shouldn't happen
    if (watch_link && watch_link.match(/^https?:\/\/guid\.instagram\.com\//))
      continue;

    var guid;
    if (type === "live") {
      guid = entry.url.match(/^https?:\/\/guid\.instagram\.com\/([0-9]+_[0-9]+)$/);
      if (guid)
        guid = guid[1];
      else
        continue;
    } else {
      guid = entry.url.match(/^https?:\/\/(?:www\.)?instagram\.com(\/p\/[^/]*)(?:\/*)?(?:[?#].*?)?$/);
      if (guid)
        guid = guid[1];
      else
        continue;
    }

    if (type === "post") // for now
      continue;

    var embedded_media = undefined;
    if (type !== "live") {
      embedded_media = [];

      if (entry.images) {
        for (var j = 0; j < entry.images.length; j++) {
          embedded_media.push({
            type: "image",
            url: entry.images[j],
            thumbnail: entry.images[j]
          });
        }
      }

      if (entry.videos) {
        for (var j = 0; j < entry.videos.length; j++) {
          embedded_media.push({
            type: "video",
            url: entry.videos[j].video,
            thumbnail: entry.videos[j].image
          });
        }
      }
    }

    entries.push({
      type,
      guid,
      site: "instagram",
      watch_link,
      embedded_media,
      username: entry.author,
      coauthors: entry.coauthors,
      time: entry.date * 1000
    });
  }

  start_add(entries);
}

function process_replays(parsed) {
  //console.log(parsed);
  var replays = [];

  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];

    if (!entry.caption.match(/Instagram Live *[0-9/]* *\[[0-9]{6}\] *$/)) {
      continue;
    }

    var username = entry.description.match(/^ *Instagram: https?:\/\/[^/]*\/([^/]*)\/? *$/m);
    if (!username) {
      continue;
    }

    var coauthors = [];
    var comatch = entry.description.match(/^ *ft\. https?:\/\/[^/]*\/[^/]*\/? *$/mg);
    if (comatch) {
      for (var j = 0; j < comatch.length; j++) {
        var matchtext = comatch[j];
        var ourmatch = matchtext.match(/^ *ft\. https?:\/\/[^/]*\/([^/]*)\/? *$/m);
        if (ourmatch) {
          coauthors.push(ourmatch[1]);
        }
      }
    }

    username = username[1];

    replays.push({
      type: "replay",
      guid: entry.url,
      site: "instagram",
      username: username,
      coauthors,
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
          member.member_name_kr !== accountname &&
          (!member.alt_groups || member.alt_groups.indexOf(accountname) < 0))
        continue;

      for (var j = 0; j < member.accounts.length; j++) {
        var account = member.accounts[j];

        if (account.site !== "instagram" && account.site !== "youtube")
          continue;

        var text = member.title + " @" + account.username + " (" + account.site + ")";
        if (readlineSync.keyInYNStrict(text)) {
          accounts.push({
            type: "account",
            site: account.site,
            username: account.username,
            can_share: can_share(member, account)
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
    return process_entries(parsed);
  }

  if (parsed.url === "https://reelstray.instagram.com/" ||
      parsed.url === "https://www.youtube.com/live" ||
      parsed.url === "https://www.youtube.com/feed/subscriptions" ||
      parsed.url === "https://www.periscope.tv/?following=true" ||
      parsed.url === "http://www.afreecatv.com/?hash=favorite" ||
      parsed.url === "http://www.goldlive.co.kr/mypage/favorite_bj") {
    return process_lives(parsed);
  }

  if (parsed.config.fullpath.startsWith("/f/youtube/playlist/" + config.parsed.YOUTUBE_PLAYLIST_ID)) {
    return process_replays(parsed);
  }

  //console.log(parsed);


}

start();
