'use strict';

var kroman = require('kroman');

module.exports = {};

var fs = require('fs');
var toml = require('toml');
const monk = require('monk');
var db = monk("localhost/webrssview?auto_reconnect=true");
module.exports.db = db;
var db_feeds = db.get("feeds");
module.exports.db_feeds = db_feeds;
var db_content = db.get("content");
module.exports.db_content = db_content;
var path = require('path');

var moment = require('moment-timezone');
var tz_offset = 9; // KST
var tz_name = "Asia/Seoul";
moment.tz.setDefault(tz_name);

var feeds_json;
var feeds_toml;

var toplevel_feed;
var toplevel_feeds = {};
module.exports.toplevel_feed = toplevel_feed;
module.exports.toplevel_feeds = toplevel_feeds;
module.exports.members = [];

var members_by_group = {};


// https://stackoverflow.com/a/10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
module.exports.pad = pad;

function create_timestamp(date) {
  var timestamp_year = pad(date.getFullYear()-2000, 2);
  var timestamp_month = pad(date.getMonth() + 1, 2);
  var timestamp_day = pad(date.getDate(), 2);
  var timestamp = timestamp_year + timestamp_month + timestamp_day;
  return timestamp;
}
module.exports.create_timestamp = create_timestamp;

function read_feeds() {
  return new Promise((resolve, reject) => {
    db_feeds.find({}).then(
      (doc) => {
        feeds_json = doc;
        resolve(doc);
      },
      () => {
        // FIXME?
        console.log("[db] Feeds rejected");
        reject();
      });
  });
}

function read_toml() {
  return new Promise((resolve, reject) => {
    var content = fs.readFileSync(path.resolve(__dirname, "feeds.toml"));
    try {
      feeds_toml = toml.parse(content);
      module.exports.feeds_toml = feeds_toml;
      resolve(feeds_toml);
    } catch (e) {
      console.error("Parsing error on line " + e.line + ", column " + e.column +
                    ": " + e.message);
      reject();
    }
  });
}
module.exports.read_toml = read_toml;

function tree_to_object(tree) {
  if (tree instanceof Array && tree.length === 1) {
    return tree_to_object(tree[0]);
  }

  if ("children" in tree) {
    var newobj = {};
    newobj.$$parent = true;

    for (var i = 0; i < tree.children.length; i++) {
      var child = tree.children[i];
      newobj[child.name] = tree_to_object(child);
    }

    return newobj;
  } else {
    return tree;
  }
}

function normalize_alt(alt) {
  if (!alt)
    return alt;

  return alt.replace(/^\s*(.*?)\s*(?:\#.*)?$/, "$1");
}

function get_user_roman(text, obj) {
  if (obj && (text in obj)) {
    obj.user_roman = true;
    return obj[text];
  }

  if (feeds_toml.roman && (text in feeds_toml.roman)) {
    return feeds_toml.roman[text];
  }

  return null;
}

function get_comment_roman(text, comment) {
  var key = text + "#" + comment;
  if (feeds_toml.roman && (key in feeds_toml.roman)) {
    return feeds_toml.roman[key];
  }

  return null;
}

function get_user_nick(text) {
  if (feeds_toml.nicks && (text in feeds_toml.nicks)) {
    return feeds_toml.nicks[text];
  }

  return null;
}

function in_ignoregroups(text) {
  if (feeds_toml.general.ignoregroups && feeds_toml.general.ignoregroups.indexOf(text) >= 0) {
    return true;
  }

  return false;
}

function in_nogroups(text) {
  if (feeds_toml.general.nogroups && feeds_toml.general.nogroups.indexOf(text) >= 0) {
    return true;
  }

  return false;
}

function in_ignorefolders(text) {
  if (feeds_toml.general.ignorefolders && feeds_toml.general.ignorefolders.indexOf(text) >= 0) {
    return true;
  }

  return false;
}

function parse_hangul(text, force, obj) {
  if (!force) {
    var roman = get_user_roman(text, obj);
    if (roman) {
      return roman;
    }
  }

  if (!has_hangul(text))
    return text;

  var parsed = kroman.parse(text);
  var splitted = parsed.split('-');
  for (var i = 0; i < splitted.length; i++) {
    //console.log(splitted[i]);

    if (splitted[i].startsWith("si")) {
      splitted[i] = "shi" + splitted[i].slice(2);
    } else if (splitted[i] === "u") {
      splitted[i] = "woo";
    } else if (splitted[i].endsWith("un") && !splitted[i].endsWith("eun")) {
      splitted[i] = splitted[i].slice(0, splitted[i].length - 2) + "oon";
    } else if (splitted[i].slice(0, 2) === "sy") {
      splitted[i] = "sh" + splitted[i].slice(2);
    } else if (splitted[i][0] === "c") {
      splitted[i] = "ch" + splitted[i].slice(1);
    } else if (i > 0 && splitted[i].slice(splitted[i].length - 3, splitted[i].length) === "eui") {
      splitted[i] = splitted[i].slice(0, splitted[i].length - 3) + "ee";
    }

    if (i > 0) {
      var prevsec = splitted[i - 1];
      var prevchar = prevsec[prevsec.length - 1];
      if (splitted[i] === "i" &&
          (prevchar === "a" ||
           prevchar === "e" ||
           prevchar === "o" ||
           prevchar === "u")) {
        splitted[i] = "yi";
      }
    }

    if (i + 1 == splitted.length) {
      if (splitted[i].endsWith("u") && !splitted[i].endsWith("eu")) {
        splitted[i] = splitted[i].slice(0, splitted[i].length - 1) + "oo";
      }
    }

    if (splitted[i] === "yeong") {
      splitted[i] = "young";
    } else if (splitted[i] === "hyeong") {
      splitted[i] = "hyung";
    }

    if (i + 1 < splitted.length) {
      var nextchar = splitted[i + 1][0];
      if (splitted[i][splitted[i].length - 1] === "r" &&
          nextchar !== "a" &&
          nextchar !== "e" &&
          nextchar !== "i" &&
          nextchar !== "o" &&
          nextchar !== "u") {
        splitted[i] = splitted[i].slice(0, splitted[i].length - 1) + "l";

        if (nextchar === "r") {
          splitted[i + 1] = "l" + splitted[i + 1].slice(1);
        }
      } else if (splitted[i].endsWith("n") && splitted[i + 1][0] === "g") {
        splitted[i + 1] = "k" + splitted[i + 1].slice(1);
      }
    }
  }

  if (splitted[0][0] == "r") {
    splitted[0] = "l" + splitted[0].slice(1);
  }

  var last = splitted[splitted.length - 1];
  if (last[last.length - 1] === "s") {
    splitted[splitted.length - 1] = last.slice(0, last.length - 1) + "t";
  } else if (last[last.length - 1] === "r") {
    splitted[splitted.length - 1] = last.slice(0, last.length - 1) + "l";
  } else if (last[last.length - 1] === "g" && last.slice(last.length - 2, last.length) !== "ng") {
    splitted[splitted.length - 1] = last.slice(0, last.length - 1) + "k";
  }

  var joined = splitted.join("");
  var words = joined.split(" ");
  var newwords = [];

  words.forEach((word) => {
    if (word.length > 1)
      newwords.push(word.charAt(0).toUpperCase() + word.slice(1));
    else
      newwords.push(word);
  });

  var retval = newwords.join(" ");
  //console.log(retval);
  return retval;
}
module.exports.parse_hangul = parse_hangul;

function parse_hangul_first(text, force, obj) {
  text = parse_hangul(text, force, obj);
  if (text instanceof Array) {
    return text[0];
  }
  return text;
}
module.exports.parse_hangul_first = parse_hangul_first;

function parse_hangul_obj(text, force, obj) {
  return {
    hangul: text,
    roman: parse_hangul(text, force, obj),
    roman_first: parse_hangul_first(text, force, obj)
  };
}

function is_hangul(charcode) {
  return charcode >= 0xAC00 && charcode <= 0xD7AF;
}
module.exports.is_hangul = is_hangul;

function has_hangul(text, k_counted) {
  for (var i = 0; i < text.length; i++) {
    if (text[i] === "ㅋ" && !k_counted)
      continue;
    if (is_hangul(text.charCodeAt(i)))
      return true;
  }

  return false;
}
module.exports.has_hangul = has_hangul;

function is_roman(text) {
  return text.match(/^[a-zA-Z0-9 ]+$/);
}

function is_mixed(text) {
  return (
    !!text.match(/[0-9]/) ||
      (has_hangul(text, true) && text.match(/[a-zA-Z]/))
  );
}

function get_last_firstname(text) {
  if (text.indexOf(" ") < 0) {
    if (has_hangul(text))
      return [text[0], text.slice(1)];
    else
      return [null, text];
  } else {
    return [text.split(" ")[0], text.replace(/^[^ ]* +/, "")];
  }
}

function parse_name(text, obj) {
  var roman = get_user_roman(text, obj);
  if (roman) {
    return roman;
  }

  if (!is_hangul(text.charCodeAt(0)))
    return parse_hangul(text, false, obj);

  var lastname = null;
  var rest;

  var lastfirst = get_last_firstname(text);
  if (lastfirst[0] !== null)
    lastname = parse_hangul(lastfirst[0], false, obj);
  //var lastname_force = parse_hangul(lastfirst[0], true, obj);
  var user_lastname = null;

  if (lastfirst[0] !== null)
    user_lastname = get_user_roman(lastfirst[0], obj);
  rest = lastfirst[1];
  /*if (text.indexOf(" ") < 0) {
    lastname = parse_hangul(text[0], false, obj);
    rest = text.slice(1);
  } else {
    lastname = parse_hangul(text.split(" ")[0], false, obj);
    rest = text.replace(/^[^ ]* +/, "");
  }*/

  if (user_lastname) {
    lastname = user_lastname;
  } else if (lastfirst[0] !== null && lastfirst[0].length === 1) {
    if (text[0] === "김") {
      lastname = "Kim";
    } else if (text[0] === "이") {
      lastname = "Lee";
    } else if (text[0] === "박") {
      lastname = "Park";
    } else if (text[0] === "임") { // should this be kept?
      lastname = "Lim";
    } else if (text[0] === "오") {
      lastname = "Oh";
    } else if (text[0] === "정") {
      lastname = "Jung";
    } else if (text[0] === "노") {
      lastname = "Noh";
    } else if (text[0] === "강") {
      lastname = "Kang";
    } else if (text[0] === "함") {
      lastname = "Hahm";
    } else if (text[0] === "최") {
      lastname = "Choi";
    } else if (text[0] === "권") {
      lastname = "Kwon";
    } else if (text[0] === "추") {
      lastname = "Chu";
    } else if (text[0] === "기") {
      lastname = "Ki";
    } else if (text[0] === "안") {
      lastname = "Ahn";
    } else if (text[0] === "간") {
      lastname = "Kan";
    } else if (text[0] === "류") {
      lastname = "Ryu";
    } else if (text[0] === "엄") {
      lastname = "Uhm";
    } else if (text[0] === "곽") {
      lastname = "Kwak";
    }
  }

  var nameval = parse_hangul(rest, false, obj);
  if (nameval instanceof Array) {
    var retval = [];

    nameval.forEach((firstname) => {
      if (lastname !== null)
        retval.push(lastname + " " + firstname);
      else
        retval.push(firstname);
    });

    return retval;
  } else {
    if (lastname !== null)
      return lastname + " " + nameval;
    else
      return nameval;
  }
  //var retval = lastname + " " + parse_hangul(rest, false, obj);
  //console.log(text);
  //console.log(retval);
  //return retval;
}
module.exports.parse_name = parse_name;

function parse_name_first(text, obj) {
  var roman = parse_name(text, obj);
  if (roman instanceof Array)
    return roman[0];
  return roman;
}
module.exports.parse_name_first = parse_name;

function parse_name_obj(text, obj) {
  return {
    hangul: text,
    roman: parse_name(text, obj),
    roman_first: parse_name_first(text, obj),
  };
}


function strip(x) {
  return x.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
}
module.exports.strip = strip;

function get_name(text, member) {
  /*if (text.length < 2)
    return;*/

  var ret = {
    "names": [],
    "nicks": [],
    "has_user_nick": false
  };

  var alt = {};

  function parse_alt(alt, member, site) {
    if (!member[site + "_username"])
      return;

    var username = member[site + "_username"].toLowerCase();
    var key = site + "/@" + username;
    if (key in feeds_toml) {
      var newalt = feeds_toml[key];
      for (var akey in newalt) {
        alt[akey] = newalt[akey];
      }
    }
  }

  /*parse_alt(alt, member, "instagram");
  parse_alt(alt, member, "twitter");
  parse_alt(alt, member, "weibo");*/

  member.accounts.forEach((account) => {
    if (!account.username) {
      //console.log(account);
      return;
    }
    var username = account.username.toLowerCase();
    if (account.site === "youtube")
      username = account.username;
    var key = account.site + "/@" + username;
    if (key in feeds_toml) {
      var newalt = feeds_toml[key];
      for (var akey in newalt) {
        alt[akey] = newalt[akey];
        ret.has_alt = true;
        if (akey === "bot_whitelist" ||
            akey === "notify_yt" ||
            akey === "upload_privacy")
          account[akey] = newalt[akey];
      }
    }
  });

  var has_manual_names = false;
  if ("names" in alt) {
    has_manual_names = true;
    alt.names.forEach((x) => {
      //ret.names.push(parse_name_obj(x, alt));
      upush(ret.names, parse_name_obj(x, alt));
    });
  }

  var has_manual_nicks = false;
  if ("nicks" in alt) {
    has_manual_nicks = true;
    ret.has_user_nick = true;
    alt.nicks.forEach((x) => {
      //ret.has_user_nick = true;
      //ret.nicks.push(parse_hangul_obj(x, false, alt));
      upush(ret.nicks, parse_hangul_obj(x, false, alt));
    });
  }

  if ("eng_kr_name" in alt) {
    ret.eng_kr_name = alt.eng_kr_name;
  }

  if ("alt_groups" in alt) {
    ret.alt_groups = alt.alt_groups;
  }

  if ("noupload" in alt) {
    ret.noupload = alt.noupload;
  }

  if ("description_template" in alt) {
    ret.description_template = alt.description_template;
  }

  if ("old_usernames" in alt) {
    ret.old_usernames = alt.old_usernames;
  }

  if ("upload_privacy" in alt) {
    ret.upload_privacy = alt.upload_privacy;
  }

  if ("playlist" in alt) {
    ret.playlist = alt.playlist;
  }

  if ("use_fullname" in alt) {
    ret.use_fullname = alt.use_fullname;
  }

  if ("hide_group" in alt) {
    ret.hide_group = alt.hide_group;
  }

  if ("bot_whitelist" in alt) {
    ret.bot_whitelist = alt.bot_whitelist;
  }

  if ("tags" in alt) {
    ret.tags = alt.tags;
  }

  if ("user_roman" in alt) {
    ret.user_roman = alt.user_roman;
  }

  if ("notify_yt" in alt) {
    ret.notify_yt = alt.notify_yt;
  }

  if ("yt_accounts_extra" in alt) {
    ret.yt_accounts_extra = alt.yt_accounts_extra;
  }

  if ("alt_accounts" in alt && alt.alt_accounts instanceof Array) {
    ret.alt_accounts = [];
    alt.alt_accounts.forEach(account => {
      var site = account.replace(/(.*)\/(.*)$/, "$1");
      var username = account.replace(/(.*)\/(.*)$/, "$2");
      var account = {
        username,
        site
      };
      account.link = get_link_for_account(account);
      ret.alt_accounts.push(account);
    });
  }

  if (text[0] === "@") {
    if (ret.names.length > 0 || ret.nicks.length > 0/*text in feeds_toml*/) {
      /*var alt = feeds_toml[text];

      alt.names.forEach((x) => {
        ret.names.push(parse_name_obj(x, feeds_toml[text]));
      });

      alt.nicks.forEach((x) => {
        ret.nicks.push(parse_hangul_obj(x, false, feeds_toml[text]));
      });*/

      return ret;
    } else {
      return text;
    }
  }


  /*if (username && ("@" + username) in feeds_toml) {
    alt = feeds_toml["@" + username];

    if ("names" in alt) {
      alt.names.forEach((x) => {
        ret.names.push(parse_name_obj(x, alt));
      });
    }

    if ("nicks" in alt) {
      alt.nicks.forEach((x) => {
        //ret.has_user_nick = true;
        ret.nicks.push(parse_hangul_obj(x, false, alt));
      });
    }
  }*/

  ret.comment = strip(text.replace(/.*# *(.*)$/, "$1"));
  text = strip(text.replace(/#.*$/, ""));
  if (text.indexOf(" (") >= 0) {
    var splitted = text.split(" (");
    var ssplitted = splitted[0].split("/");
    if (!has_manual_names) {
      ssplitted.forEach((x) => {
        //ret.names.push(parse_name_obj(x, alt));
        upush(ret.names, parse_name_obj(x, alt));
      });
    }

    ssplitted = splitted[1].replace(/^\(/, "").replace(/\)$/, "").split("/");
    if (!has_manual_nicks) {
      ssplitted.forEach((x) => {
        ret.has_user_nick = true;
        //ret.nicks.push(parse_hangul_obj(x, false, alt));
        upush(ret.nicks, parse_hangul_obj(x, false, alt));
      });
    }
  } else {
    var splitted = text.split("/");
    splitted.forEach((x) => {
      if (x.length > 2 && !is_mixed(x) && get_user_nick(x) !== false) {
        /*var splitted = x.split("/");
        splitted.forEach((x) => {
          ret.names.push(parse_name_obj(x, alt));
          ret.nicks.push(parse_hangul_obj(x.slice(1), false, alt));
        });*/
        //ret.names.push(parse_name_obj(x, alt));
        if (!has_manual_names) {
          upush(ret.names, parse_name_obj(x, alt));
        }
        //ret.nicks.push(parse_hangul_obj(x.slice(1), false, alt));
        //upush(ret.nicks, parse_hangul_obj(x.slice(1), false, alt));

        if (!has_manual_nicks) {
          upush(ret.nicks, parse_hangul_obj(get_last_firstname(x)[1], false, alt));
        }
      } else {
        //ret.nicks.push(parse_hangul_obj(x, false, alt));
        if (!has_manual_nicks) {
          upush(ret.nicks, parse_hangul_obj(x, false, alt));
        }
      }
    });
  }

  return ret;
}

function flatten_obj(obj) {
  var newobj = {
  };

  for (var item in obj) {
    if (item === "$$parent")
      continue;

    var item_obj = obj[item];
    if (item_obj.$$parent) {
      item_obj = flatten_obj(item_obj);
      for (var subitem in item_obj) {
        newobj[subitem] = item_obj[subitem];
        newobj[subitem].parents.unshift(item);
      }
    } else {
      newobj[item] = {
        obj: item_obj,
        parents: []
      };
    }
  }

  return newobj;
}

function upush(array, item) {
  if (item instanceof Array) {
    item.forEach((x) => {
      upush(array, x);
    });
  } else {
    var sitem = JSON.stringify(item);
    for (var i = 0; i < array.length; i++) {
      if (sitem === JSON.stringify(array[i])) {
        return;
      }
    }
    array.push(item);
  }
}
module.exports.upush = upush;

function uunshift(array, item) {
  if (item instanceof Array) {
    item.forEach((x) => {
      uunshift(array, x);
    });
  } else {
    var sitem = JSON.stringify(item);
    for (var i = 0; i < array.length; i++) {
      if (sitem === JSON.stringify(array[i])) {
        return;
      }
    }
    array.unshift(item);
  }
}

function get_description_properties(desc) {
  if (!desc)
    return null;

  var desc_info = desc.replace(/^[\s\S]*\n---\n/, "");
  if (desc_info === desc) {
    desc_info = desc.replace(/^---\n/, "");
  }

  if (desc_info !== desc) {
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
module.exports.get_description_properties = get_description_properties;

function get_username_from_rssit_obj(obj) {
  var url = obj.url.replace(/.*\/(?:instagram|twitter|weibo)\/u\/([^/?&]*).*$/, "$1");
  if (url !== obj.url)
    return url;

  var props = get_description_properties(obj.description);
  if (props && props.username)
    return props.username;

  if (obj.link) {
    var channellink = obj.link.replace(/^[a-z]+:\/\/(?:www\.)?youtube\.com\/channel\/+(UC[^/]*)(?:[?#].*)?$/,
                                       "$1");
    if (channellink !== obj.link)
      return channellink;
  }
}
module.exports.get_username_from_rssit_obj = get_username_from_rssit_obj;

function get_link_for_account(account) {
  if (account.site === "instagram")
    return "https://www.instagram.com/" + account.username;
  if (account.site === "periscope")
    return "https://www.periscope.tv/" + account.username;
  if (account.site === "weibo")
    return "https://www.weibo.com/u/" + account.username;
  if (account.site === "twitter")
    return "https://www.twitter.com/" + account.username;
  if (account.site === "youtube")
    return "https://www.youtube.com/channel/" + account.username;
  if (account.site === "afreecatv")
    return "https://bj.afreecatv.com/" + account.username;
  return null;
}

function parse_member(obj, options) {
  var member = {
  };

  if ("$$parent" in obj)
    return;

  member.alt = obj.name;
  var member_comment = strip(member.alt.replace(/.*# */, ""));
  if (member_comment !== strip(member.alt))
    member.comment = member_comment;
  else
    member.comment = "";

  var username = get_username_from_rssit_obj(obj);
  if (username && username != obj.url) {
    /*if (options && options.site) {
      member[options.site + "_username"] = username;
    } else {
      member.username = username;
    }*/
  }

  member.accounts = [{
    username,
    "site": options.site,
    "link": obj.link,
    obj
  }];


  var name = get_name(obj.name, member);
  if (name && (name.names || name.nicks)) {
    member.names = name.names;
    member.nicks = name.nicks;
    member.has_user_nick = name.has_user_nick;
    member.eng_kr_name = name.eng_kr_name;
    if (name.alt_groups !== undefined)
      member.alt_groups = name.alt_groups;
    if (name.noupload !== undefined)
      member.noupload = name.noupload;
    if (name.description_template !== undefined)
      member.description_template = name.description_template;
    if (name.old_usernames !== undefined)
      member.old_usernames = name.old_usernames;
    if (name.upload_privacy !== undefined)
      member.upload_privacy = name.upload_privacy;
    if (name.playlist !== undefined)
      member.playlist = name.playlist;
    if (name.use_fullname !== undefined)
      member.use_fullname = name.use_fullname;
    if (name.hide_group !== undefined)
      member.hide_group = name.hide_group;
    if (name.bot_whitelist !== undefined)
      member.bot_whitelist = name.bot_whitelist;
    if (name.user_roman !== undefined)
      member.user_roman = name.user_roman;
    if (name.has_alt !== undefined)
      member.has_alt = name.has_alt;
    if (name.notify_yt !== undefined) {
      member.notify_yt = name.notify_yt;
    }
    if (name.yt_accounts_extra !== undefined)
      member.yt_accounts_extra = name.yt_accounts_extra;
    if (name.tags !== undefined && name.tags.length > 0) {
      member.user_tags = name.tags;
    }
    if (name.alt_accounts !== undefined && name.alt_accounts.length > 0) {
      name.alt_accounts.forEach(account => {
        member.accounts.push(account);
      });
    }

    if (options.group) {
      if (options.group in feeds_toml) {
        for (var key in feeds_toml[options.group]) {
          if (!(key in member)) {
            member[key] = feeds_toml[options.group][key];

            if (key === "bot_whitelist") {
              member.accounts.forEach(account => {
                account.bot_whitelist = feeds_toml[options.group][key];
              });
            }
          }
        }
      }
    }
  }


  if (options) {
    if (options.group && !in_nogroups(options.group)) {
      member.group = options.group;
      member.group_yt = member.group;
      member.group_roman = parse_hangul_first(member.group);
      member.group_roman_yt = member.group_roman;
      member.group_romans = parse_hangul(member.group);

      if (member.group_roman.indexOf("NOUPLOAD") >= 0) {
        member.group_roman = strip(member.group_roman.replace(/ *NOUPLOAD$/, ""));
        member.group_noupload = true;
        member.group_yt += " NOUPLOAD";
      }

      if (options.groupcomment) {
        member.groupcomment = options.groupcomment;
        var newroman = get_comment_roman(member.group, member.groupcomment);
        if (newroman)
          member.group_roman = newroman;
      }
    }

    if (options.group && in_nogroups(options.group)) {
      member.nogroup = options.group;
    }

    if (options.category) {
      member.category = options.category;
    }

    if (options.ex) {
      member.ex = options.ex;
    }

    if (options.family) {
      member.family = options.family;
    }

    if (options.haitus) {
      member.haitus = options.haitus;
    }
  }

  if (member.alt_groups) {
    member.alt_groups_roman = [];
    for (var i = 0; i < member.alt_groups.length; i++) {
      member.alt_groups_roman.push(parse_hangul_first(member.alt_groups[i]));
    }
  }

  /*if (options && options.site) {
    member[options.site + "_obj"] = obj;
  } else {
    member.obj = obj;
    }*/

  member.tags = JSON.parse(JSON.stringify(feeds_toml.general.defaulttags));

  if (options) {
    if (options.ex) {
      //upush(member.tags, "전");
      upush(member.tags, "前");
      upush(member.tags, "ex");
      upush(member.tags, "탈퇴");
    }

    if (member.group) {
      upush(member.tags, "멤버");
      upush(member.tags, "member");

      upush(member.tags, member.group);
      upush(member.tags, member.group_roman);

      var group_hangul = parse_hangul(member.group);
      if (group_hangul instanceof Array) {
        group_hangul.forEach((hangul) => {
          upush(member.tags, hangul);
        });
      }

      var groupnick = get_user_nick(member.group);
      if (groupnick) {
        if (!(groupnick instanceof Array)) {
          groupnick = [groupnick];
        }

        groupnick.forEach((x) => {
          upush(member.tags, x);
          upush(member.tags, parse_hangul(x));
        });
      }
    }
  }

  if (member.alt_groups) {
    upush(member.tags, "멤버");
    upush(member.tags, "member");

    for (var i = 0; i < member.alt_groups.length; i++) {
      upush(member.tags, member.alt_groups[i]);
      upush(member.tags, member.alt_groups_roman[i]);
    }
  }

  if (member.names) {
    member.names.forEach((name) => {
      upush(member.tags, name.hangul);
      upush(member.tags, name.roman);
    });

    for (var i = 0; i < member.names.length; i++) {
      if (is_roman(member.names[i].hangul)) {
        member.names_roman_first = member.names[i].hangul;
        break;
      }
    }

    if (!member.names_roman_first) {
      for (var i = 0; i < member.names.length; i++) {
        if (member.names[i].roman_first && member.names[i].roman_first.match(/[a-zA-Z0-9]/)) {
          member.names_roman_first = member.names[i].roman_first;
          break;
        }
      }
    }

    for (var i = 0; i < member.names.length; i++) {
      if (member.names[i].hangul && has_hangul(member.names[i].hangul)) {
        member.names_hangul_first = member.names[i].hangul;
        break;
      }
    }
  }

  if (member.nicks) {
    member.nicks.forEach((name) => {
      upush(member.tags, name.hangul);
      upush(member.tags, name.roman);
    });

    for (var i = 0; i < member.nicks.length; i++) {
      if (is_roman(member.nicks[i].hangul)) {
        member.nicks_roman_first = member.nicks[i].hangul;
        break;
      }
    }

    if (!member.nicks_roman_first) {
      for (var i = 0; i < member.nicks.length; i++) {
        if (member.nicks[i].roman_first && member.nicks[i].roman_first.match(/[a-zA-Z0-9]/)) {
          member.nicks_roman_first = member.nicks[i].roman_first;
          break;
        }
      }
    }

    for (var i = 0; i < member.nicks.length; i++) {
      if (member.nicks[i].hangul && has_hangul(member.nicks[i].hangul)) {
        member.nicks_hangul_first = member.nicks[i].hangul;
        break;
      }
    }
  }

  var member_name;
  var korean_member_name;

  if (member.group && !member.family && !member.hide_group) {
    if (member.nicks_roman_first && !member.use_fullname)
      member_name = member.nicks_roman_first;
    else if (member.names_roman_first)
      member_name = member.names_roman_first;
    else
      member_name = member.alt;

    if (member.nicks && !member.use_fullname) {
      if (member.nicks_hangul_first)
        korean_member_name = member.nicks_hangul_first;
      else if (member.nicks_roman_first)
        korean_member_name = member.nicks_roman_first;
    }

    if (!korean_member_name) {
      if (member.names && member.names_hangul_first)
        korean_member_name = member.names_hangul_first;
      else if (has_hangul(member.alt))
        korean_member_name = member.alt;
      else
        korean_member_name = member_name;
    }
  } else {
    if (member.nicks_roman_first &&
        (member.has_user_nick || !(member.names_roman_first)))
      member_name = member.nicks_roman_first;
    else if (member.names_roman_first)
      member_name = member.names_roman_first;
    else
      member_name = member.alt;

    if (member.nicks && (member.nicks_hangul_first || member.nicks_roman_first) &&
        (member.has_user_nick || !(member.names_roman_first))) {
      korean_member_name = member.nicks_hangul_first || member.nicks_roman_first;
    } else if (member.names && member.names_hangul_first) {
      korean_member_name = member.names_hangul_first;
    } else if (has_hangul(member.alt)) {
      korean_member_name = member.alt;
    } else {
      korean_member_name = member_name;
    }
  }

  if (member.user_tags)
    upush(member.tags, member.user_tags);

  member.member_name_kr = korean_member_name;
  member.member_name = member_name;

  if (member.eng_kr_name) {
    member.member_fullname = member.eng_kr_name;
  } else if (member.names && member.names[0]) {
    if (member.names[0].hangul !== member_name)
      member.member_fullname = member.names[0].hangul;
  } else if (member.nicks && member.nicks[0]) {
    if (member.nicks[0].hangul !== member_name)
      member.member_fullname = member.nicks[0].hangul;
  }

  if (member.names && member.names[0] && member.names[0].hangul !== korean_member_name)
    member.member_fullname_kr = member.names[0].hangul;
  else if (member.nicks && member.nicks[0] && member.nicks[0].hangul !== korean_member_name &&
           member.has_user_nick)
    member.member_fullname_kr = member.nicks[0].hangul;

  var noupload_text = "";
  if (member.noupload)
    noupload_text = " NOUPLOAD";

  var grouptitle = "";
  var grouptitle_yt = "";
  var title = "";
  var title_yt = "";
  if (member.group && !member.family && !member.hide_group) {
    if (member.ex && !member.haitus) {
      grouptitle = "Ex-";
    }

    grouptitle_yt = grouptitle + member.group_roman_yt + " ";
    grouptitle = grouptitle + member.group_roman + " ";

    if (member.family) {
      if (member.nicks_roman_first &&
          (member.has_user_nick || !(member.names_roman_first)) && !member.use_fullname)
        title += member.nicks_roman_first;
      else if (member.names_roman_first)
        title += member.names_roman_first;
      else
        title += member.alt;

      var comment = member.comment
          .replace("의", "'s")
          .replace("언니", "sister")
          .replace("누나", "sister")
          .replace("여동생", "sister")
          .replace("오빠", "brother")
          .replace("형", "brother")
          .replace("남동생", "brother");
      var comment_name = parse_hangul_first(comment.replace(/'s.*/, ""));
      title += " (" + grouptitle + comment_name + comment.replace(/.*'s/, "'s") + ")";
    } else {
      title += grouptitle;
      title_yt += grouptitle_yt;

      var title_name = "";
      if (member.nicks_roman_first && !member.use_fullname)
        title_name += member.nicks_roman_first;
      else if (member.names_roman_first)
        title_name += member.names_roman_first;
      else
        title_name += member.alt;

      if (strip(grouptitle_yt) !== strip(title_name)) {
        title += title_name;
        title_yt += title_name;
      }
    }
  } else {
    if (member.member_name) {
      title += member.member_name;
    } else if (member.nicks_roman_first &&
               (member.has_user_nick || !(member.names_roman_first))) {
      title += member.nicks_roman_first;
    } else if (member.names_roman_first) {
      title += member.names_roman_first;
    } else {
      title += member.alt;
    }

    title_yt = title;
  }

  // TODO: add tags for family members

  member.title = strip(title);
  member.title_yt = strip(title_yt) + noupload_text;

  var title_kr = "";
  var title_kr_yt = "";
  if (member.group && !member.family && !member.hide_group) {
    var kr_ex = "";
    var kr_ex1 = "";
    if (member.ex && !member.haitus) {
      kr_ex = "前멤버 ";
      kr_ex1 = "前 ";
    }

    var korean_group = member.group;
    var korean_group_yt = member.group_yt;

    if (member.member_name_kr)
      title_kr = member.member_name_kr;
    else if (member.nicks && member.nicks[0])
      title_kr = member.nicks[0].hangul;
    else if (member.names && member.names[0])
      title_kr = member.names[0].hangul;
    else
      title_kr = member.alt;

    if (title_kr !== korean_group) {
      //korean_name += korean_group + " " + kr_ex + title_kr;
      var orig_title_kr = title_kr;
      title_kr = kr_ex1 + korean_group + " " + orig_title_kr;
      title_kr_yt = kr_ex1 + korean_group_yt + " " + orig_title_kr;
    } else {
      title_kr = korean_group;
      title_kr_yt = korean_group_yt;
    }
  } else {
    if (member.member_name_kr) {
      title_kr += member.member_name_kr;
    } else if (member.nicks && member.nicks[0] &&
        (member.has_user_nick || !(member.names_roman_first))) {
      title_kr += member.nicks[0].hangul;
    } else if (member.names && member.names[0]) {
      title_kr += member.names[0].hangul;
    } else {
      title_kr += member.alt;
    }

    title_kr_yt = title_kr;
  }

  member.title_kr = strip(title_kr);
  member.title_kr_yt = strip(title_kr_yt) + noupload_text;

  return member;
}

function same_member(member1, member2) {
  if (!member1 || !member2)
    return false;

  if (normalize_alt(member1.group) !== normalize_alt(member2.group)) {
    return false;
  }

  if (normalize_alt(member1.alt) === normalize_alt(member2.alt)) {
    return true;
  }

  var i, j;
  if (member1.nicks && member2.nicks) {
    for (i = 0; i < member1.nicks.length; i++) {
      for (j = 0; j < member2.nicks.length; j++) {
        if (member1.nicks[i].hangul === member2.nicks[j].hangul) {
          return true;
        }
      }
    }
  }

  if (member1.names && member2.names) {
    for (i = 0; i < member1.names.length; i++) {
      for (j = 0; j < member2.names.length; j++) {
        if (member1.names[i] === member2.names[j])
          return true;
      }
    }
  }

  return false;
}

function merge_members(member1, member2) {
  //var newmember = JSON.parse(JSON.stringify(member1));
  var newmember = member1;

  //var member2_priority = member2.has_user_nick;
  /*if (member1.member_name_kr === "젤로") {
    console.log(member1);
  }
  if (member2.member_name_kr === "젤로") {
    console.log(member2);
    }*/

  var member2_priority = !!member2.has_alt;

  var i, j;
  if (member2.nicks) {
    for (j = 0; j < member2.nicks.length; j++) {
      if (member2_priority)
        uunshift(newmember.nicks, member2.nicks[j]);
      else
        upush(newmember.nicks, member2.nicks[j]);
      /*if (newmember.nicks.indexOf(member2.nicks[j]) < 0)
        newmember.nicks.push(member2.nicks[j]);*/
    }
  }

  if (member2_priority) {
    newmember.nicks_roman_first = member2.nicks_roman_first;
    newmember.nicks_hangul_first = member2.nicks_hangul_first;
    newmember.member_name_kr = member2.member_name_kr;
    newmember.member_name = member2.member_name;
    newmember.title = member2.title;
    newmember.title_yt = member2.title_yt;
    newmember.title_kr = member2.title_kr;
    newmember.title_kr_yt = member2.title_kr_yt;
    newmember.has_user_nick = member2.has_user_nick;
  }

  if (member2.names) {
    for (j = 0; j < member2.names.length; j++) {
      upush(newmember.names, member2.names[j]);
      /*if (newmember.names.indexOf(member2.names[j]) < 0)
        newmember.names.push(member2.names[j]);*/
    }
  }

  var common = [];
  for (i = 0; i < newmember.accounts.length; i++) {
    for (j = 0; j < member2.accounts.length; j++) {
      if (newmember.accounts[i].link === member2.accounts[j].link)
        common.push(member2.accounts[j].link);
    }
  }

  for (j = 0; j < member2.accounts.length; j++) {
    if (common.indexOf(member2.accounts[j].link) < 0) {
      newmember.accounts.push(member2.accounts[j]);
    }
  }

  //console.dir(newmember);

  return newmember;
}

function do_sns(site) {
  if (!feeds_toml[site]) {
    console.error("[" + site + "] not in feeds.toml");
    return;
  }

  if (!feeds_toml[site].path) {
    console.error("Need 'path' property for [" + site + "]");
    return;
  }

  var obj = tree_to_object(feeds_json);
  var toplevel = obj;
  for (var i = 0; i < feeds_toml[site].path.length; i++) {
    if (feeds_toml[site].path[i] in toplevel) {
      toplevel = toplevel[feeds_toml[site].path[i]];
    } else {
      console.error("Unable to find path:" + feeds_toml[site].path[i]);
      return;
    }
  }

  module.exports.toplevel_feeds[site] = toplevel;

  var groups = {};
  var group_categories = {};
  for (var folder in toplevel) {
    if (typeof toplevel[folder] !== "object")
      continue;

    if (!feeds_toml[site].categories) {
      if (!in_ignoregroups(folder))
        groups[folder] = toplevel[folder];
      continue;
    }

    for (var group in toplevel[folder]) {
      if (typeof toplevel[folder][group] !== "object" || in_ignoregroups(group))
        continue;

      group_categories[group] = folder;

      if (groups[group]) {
        for (var key in toplevel[folder][group]) {
          groups[group][key] = toplevel[folder][group][key];
        }
      } else {
        groups[group] = toplevel[folder][group];
      }
    }
  }

  var members = [];

  for (var group in groups) {
    var groupname = group.replace(/ *#.*/, "");
    var groupcomment = group.replace(/.*# */, "");
    /*console.log(group);
      console.log(parse_hangul(group));
      console.log("---");*/

    var category = group_categories[group];

    if (groups[group].$$parent) {
      var group_obj = groups[group];
      for (var member in group_obj) {
        var member_obj = group_obj[member];

        if (member === "$$parent")
          continue;

        if (in_ignorefolders(member))
          continue;

        if (member === "前") {
          var exes = flatten_obj(member_obj);
          for (var ex in exes) {
            var options = {ex: true, group: groupname, groupcomment: groupcomment, site, category};
            if (exes[ex].parents.indexOf("잠정") >= 0) {
              options.haitus = true;
            }
            members.push(parse_member(exes[ex].obj, options));
          }
        } else if (member === "가족") {
          var family = flatten_obj(member_obj);
          for (var f in family) {
            members.push(parse_member(family[f].obj, {family: true, group: groupname, groupcomment: groupcomment, site, category}));
          }
        }
        members.push(parse_member(member_obj, {group: groupname, groupcomment: groupcomment, site, category}));
      }
    } else {
      members.push(parse_member(groups[group], {site, category}));
    }

    //console.log("");
  }

  if (!module.exports.members)
    module.exports.members = [];

  members.forEach((member) => {
    if (!member)
      return;

    if (!members_by_group[member.group])
      members_by_group[member.group] = [];
  });

  module.exports.members.forEach((member) => {
    if (!member)
      return;

    if (!members_by_group[member.group])
      members_by_group[member.group] = [];

    members_by_group[member.group].push(member);
  });

  function add_member(member) {
    module.exports.members.push(member);
    if (member.group && members_by_group[member.group])
      members_by_group[member.group].push(member);
  }

  if (module.exports.members || true) {
    members.forEach((member) => {
      if (!member)
        return;

      if (member.group in members_by_group) {
        var found = false;
        members_by_group[member.group].forEach((gmember) => {
          if (gmember === member)
            return;

          if (found && false)
            return;

          if (!same_member(gmember, member))
            return;

          /*if (normalize_alt(gmember.alt) !== normalize_alt(member.alt)) {
            // TODO: add more fuzzy checks
            return;
          }*/

          merge_members(gmember, member);
          /*if (!gmember[site + "_username"])
            gmember[site + "_username"] = member[site + "_username"];

          if (!gmember[site + "_obj"])
            gmember[site + "_obj"] = member[site + "_obj"];*/

          found = true;
        });

        if (!found)
          add_member(member);
      } else {
        module.exports.members.push(member);
      }
    });
  } else {
    module.exports.members = members;
  }

  if (false) {
    module.exports.members.forEach((member) => {
      if (!member)
        return;

      if (!members_by_group[member.group])
        members_by_group[member.group] = [];

      members_by_group[member.group].push(member);
    });
  }

  return members;
}

function parse_feeds_inner() {
  return new Promise((resolve, reject) => {
    Promise.all([read_feeds(), read_toml()]).then(
      () => {
        do_sns("instagram");
        do_sns("twitter");
        do_sns("weibo");
        do_sns("periscope");
        do_sns("youtube");

        resolve(module.exports.members);
      })
      .catch((e) => {
        console.dir(e);
        reject(e);
      }
    );
  });
}

function parse_feeds(noclose_db) {
  return new Promise((resolve, reject) => {
    parse_feeds_inner()
      .then(
        (members) => {
          if (!noclose_db)
            db.close();
          resolve(members);
        })
      .catch(
        (data) => {
          if (!noclose_db)
            db.close();
          reject(data);
        }
      );
  });
}
module.exports.parse_feeds = parse_feeds;

function videoid_from_youtube_url(url) {
  return url.match(/:\/\/[^/]*\/[^/]*?[?&](?:v|video_id)=([^&]*)/)[1];
}
module.exports.videoid_from_youtube_url = videoid_from_youtube_url;

function template_parse(template, variablecb) {
  (function(orig_variablecb) {
    variablecb = function(x) {
      if (x === "$!length") {
        return 0;
      }
      return orig_variablecb(x);
    };
  })(variablecb);

  var total_length = 0;
  function parse_block(variablecb, start, startbracket, stack) {
    if (stack > 100) {
      console.log("[ERROR] Template parsing stack reached >100");
      return "";
    }

    var type = null;
    var in_escape = false;
    var ret = "";
    var varname = "";
    var use_varname = true;
    var varname_end = 0;
    var i = start;
    var thelist = null;
    var listindex = 0;

    (function(orig_variablecb) {
      variablecb = function(x) {
        if (x === "$!length") {
          return orig_variablecb(x) + ret.length;
        }
        return orig_variablecb(x);
      };
    })(variablecb);

    for (i = start; i < template.length; i++) {
      var c = template[i];

      if (c === "{" && !in_escape) {
         if (startbracket) {
           type = "variable";
        } else {
          var newtext = parse_block(variablecb, i+1, true, stack+1);
          i = newtext[1];
          if (use_varname && type !== null)
            varname += newtext[0];
          else
            ret += newtext[0];

        }

        startbracket = false;
        continue;
      }

      if (startbracket) {
        if (c === "%") {
          type = "with";
        } else if (c === "[") {
          type = "list";
          (function(orig_variablecb) {
            variablecb = function(x) {
              var sx = strip(x);
              if (sx === "$last" || sx === "$i") {
                if (!(thelist instanceof Array))
                  return;

                if (sx === "$last") {
                  return listindex + 1 >= thelist.length;
                } else if (sx === "$i") {
                  return listindex;
                }
              }

              if ((x.startsWith("$") && sx.length === 1) ||
                  x.startsWith("$.")) {
                x = x.slice(1);
                if (!(thelist instanceof Array) || listindex >= thelist.length)
                  return;

                var thevar = thelist[listindex];

                if (sx.length === 0 || x[0] !== '.')
                  return thevar;

                while (x.length > 0 && x[0] === '.') {
                  if (typeof thevar !== "object")
                    return;

                  thevar = thevar[x.replace(/^\.([^.]*).*?$/, "$1")];
                  x = x.replace(/^\.[^.]*/, "");
                }

                return thevar;
              } else {
                return orig_variablecb(x);
              }
            };
          })(variablecb);
        }

        startbracket = false;
        continue;
      }

      if (c === "}" && !in_escape && type !== null) {
        varname = strip(varname);
        if (type === "variable") {
          ret += variablecb(varname);
        } else if (type === "with") {
          var not = false;
          var our_op = null;
          var opval = null;
          var ops = {
            "==": function(a, b) { return a == b; },
            "!=": function(a, b) { return a != b; },
            ">": function(a, b) { return parseInt(a) > parseInt(b); },
            ">=": function(a, b) { return parseInt(a) >= parseInt(b); },
            "<": function(a, b) { return parseInt(a) < parseInt(b); },
            "<=": function(a, b) { return parseInt(a) <= parseInt(b); }
          };
          if (varname[0] === "!") {
            varname = varname.slice(1);
            not = true;
          }

          for (var op in ops) {
            if (varname.indexOf(op) > 0) {
              var split_result = varname.split(op);
              varname = split_result[0];
              our_op = op;
              opval = split_result[1];
              break;
            }
          }

          var varvalue = variablecb(varname);

          if (our_op === null) {
            if (varvalue instanceof Array && varvalue.length === 0) {
              varvalue = false;
            }
          } else {
            varvalue = ops[our_op](varvalue, opval);
          }

          if ((!not && varvalue) ||
              (not && !varvalue)) {
            return [ret, i];
          } else {
            return ["", i];
          }
        } else if (type === "list") {
          if (thelist instanceof Array) {
            if ((listindex + 1) < thelist.length) {
              listindex++;
              i = varname_end;
              continue;
            } else {
              //variablecb = orig_variablecb;
            }
          } else {
            //variablecb = orig_variablecb;
            return ["", i];
          }
        }
        return [ret, i];
      }

      if (c === "\\" && !in_escape) {
        in_escape = true;
        continue;
      } else if (in_escape) {
        in_escape = false;
      }

      if (type === null) {
        ret += c;
      } else {
        if (c === " " && use_varname) {
          use_varname = false;
          if (type === "list") {
            thelist = variablecb(varname);
          }
          varname_end = i;
          continue;
        }

        if (use_varname) {
          varname += c;
        } else {
          ret += c;
        }
      }
    }

    return [ret, i-1];
  }
  return parse_block(variablecb, 0, false, 0)[0];
}
module.exports.template_parse = template_parse;

function get_settings() {
  var settings = JSON.parse(JSON.stringify(parse_feeds.feeds_toml.general));
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] in parse_feeds.feeds_toml) {
      var top = parse_feeds.feeds_toml[arguments[i]];
      for (var setting in top) {
        settings[setting] = JSON.parse(JSON.stringify(top[setting]));
      }
    }
  }

  return settings;
}
module.exports.get_settings = get_settings;
