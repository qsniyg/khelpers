var parse_feeds = require('./parse_feeds');
var request = require('request');

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

var followers_low = 5000;
var followers_high = 2*1000*1000;

var time_low = 2*60*60*1000;
var time_high = 48*60*60*1000;

function interpolate(value_low, value_high, input_low, input_high, input) {
  input = Math.max(0, input - input_low);
  var range = (input_high - input_low);
  input = Math.min(1, Math.pow(input, 1/3) / Math.pow(range, 1/3));

  return value_low + (value_high - value_low) * (1 - input);
}

function get_properties(account) {
  var desc = account.obj.description;
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


  var properties = get_properties(account);
  if (properties) {
    if (properties.followers !== undefined) {
      var followers = parseInt(properties.followers);
      if (followers < followers_low)
        return false;

      var delay = interpolate(time_low, time_high, followers_low, followers_high, followers);
      var added_at = account.added_at;
      if (added_at) {
        var diff = Date.now() - added_at;
        if (diff <= time_low || diff < delay)
          return false;
      }
    }
  }

  if (member.group || member.nogroup === "가수") {
    return true;
  }

  return false;
}

parse_feeds.parse_feeds().then((members) => {
  var member_name = process.argv[2];
  var site = process.argv[3] || "instagram";

  for (var i = 0; i < members.length; i++) {
    var member = members[i];
    var account = null;
    if (!member || !(account = is_member_account(member, member_name, site)) || !can_share(member, account))
      continue;

    console.log(member);
    var properties = get_properties(account);
    var result = {
      type: "live",
      site,
      username: account.username,
      member_type: "group_member",
      group: member.group_romans,
      group_kr: member.group,
      profile_link: account.link,
      watch_link: account.link,
      name: member.title,
      name_kr: member.title_kr,
      member_name: member.member_name,
      member_name_kr: member.member_name_kr,
      noupload: member.noupload,
      group_noupload: member.group_noupload
    };

    if (properties) {
      result.uid = properties.uid;
    }

    console.log(result);

    request.post({
      uri: 'http://localhost:8456/add',
      method: 'POST',
      json: result
    });
  }
});
