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
module.exports.toplevel_feed = toplevel_feed;


// https://stackoverflow.com/a/10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

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

function get_user_roman(text, obj) {
  if (obj && (text in obj))
    return obj[text];

  if (feeds_toml.roman && (text in feeds_toml.roman)) {
    return feeds_toml.roman[text];
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

function in_ignorefolders(text) {
  if (feeds_toml.general.ignorefolders && feeds_toml.general.ignorefolders.indexOf(text) >= 0) {
    return true;
  }

  return false;
}

function parse_hangul(text, force, obj) {
  if (!force) {
    var roman = get_user_roman(text, obj);
    if (roman)
      return roman;
  }

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
    } else if (splitted[i].slice(splitted[i].length - 3, splitted[i].length) === "eui") {
      splitted[i] = splitted[i].slice(0, splitted[i].length - 3) + "ee";
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
  var retval = joined.charAt(0).toUpperCase() + joined.slice(1);
  //console.log(retval);
  return retval;
}
module.exports.parse_hangul = parse_hangul;

function parse_hangul_first(text, force, obj) {
  text = parse_hangul(text, force, obj);
  if (text instanceof Array)
    return text[0];
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

function parse_name(text, obj) {
  var roman = get_user_roman(text, obj);
  if (roman)
    return roman;

  if (!is_hangul(text.charCodeAt(0)))
    return parse_hangul(text, false, obj);

  var lastname = parse_hangul(text[0], false, obj);
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
  }
  var retval = lastname + " " + parse_hangul(text.slice(1), false, obj);
  //console.log(text);
  //console.log(retval);
  return retval;
}
module.exports.parse_name = parse_name;

function parse_name_obj(text, obj) {
  return {
    hangul: text,
    roman: parse_name(text, obj)
  };
}


function strip(x) {
  return x.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
}

function get_name(text, username) {
  if (text.length < 2)
    return;

  var ret = {
    "names": [],
    "nicks": []
  };

  if (text[0] === "@") {
    if (text in feeds_toml) {
      var alt = feeds_toml[text];

      alt.names.forEach((x) => {
        ret.names.push(parse_name_obj(x, feeds_toml[text]));
      });

      alt.nicks.forEach((x) => {
        ret.nicks.push(parse_hangul_obj(x, false, feeds_toml[text]));
      });

      return ret;
    } else {
      return text;
    }
  }

  var alt = {};

  if (username && ("@" + username) in feeds_toml) {
    alt = feeds_toml["@" + username];

    if ("names" in alt) {
      alt.names.forEach((x) => {
        ret.names.push(parse_name_obj(x, alt));
      });
    }

    if ("nicks" in alt) {
      alt.nicks.forEach((x) => {
        ret.nicks.push(parse_hangul_obj(x, false, alt));
      });
    }
  }

  text = strip(text.replace(/#.*$/, ""));
  if (text.indexOf(" ") >= 0) {
    var splitted = text.split(" ");
    var ssplitted = splitted[0].split("/");
    ssplitted.forEach((x) => {
      ret.names.push(parse_name_obj(x, alt));
    });

    ssplitted = splitted[1].replace(/^\(/, "").replace(/\)$/, "").split("/");
    ssplitted.forEach((x) => {
      ret.nicks.push(parse_hangul_obj(x, false, alt));
    });
  } else {
    var splitted = text.split("/");
    splitted.forEach((x) => {
      if (x.length > 2 && is_hangul(x.charCodeAt(0)) && get_user_nick(x) !== false) {
        /*var splitted = x.split("/");
        splitted.forEach((x) => {
          ret.names.push(parse_name_obj(x, alt));
          ret.nicks.push(parse_hangul_obj(x.slice(1), false, alt));
        });*/
        ret.names.push(parse_name_obj(x));
        ret.nicks.push(parse_hangul_obj(x.slice(1)));
      } else {
        ret.nicks.push(parse_hangul_obj(x, false, alt));
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
      }
    } else {
      newobj[item] = item_obj;
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
    if (array.indexOf(item) < 0)
      array.push(item);
  }
}

function get_username_from_rssit_url(url) {
  return url.replace(/.*\/instagram\/u\/([^/?&]*).*$/, "$1");
}

function parse_member(obj, options) {
  var member = {
  };

  if ("$$parent" in obj)
    return;

  member.alt = obj.name;
  var username = get_username_from_rssit_url(obj.url);
  if (username && username != obj.url) {
    member.username = username;
  }

  var name = get_name(obj.name, member.username);
  if (name && (name.names || name.nicks)) {
    member.names = name.names;
    member.nicks = name.nicks;
  }


  if (options) {
    if (options.group) {
      member.group = options.group;
    }

    if (options.ex) {
      member.ex = options.ex;
    }
  }

  member.obj = obj;

  member.tags = JSON.parse(JSON.stringify(feeds_toml.general.defaulttags));

  if (options) {
    if (options.ex) {
      upush(member.tags, "전");
      upush(member.tags, "前");
      upush(member.tags, "ex");
    }

    if (options.group) {
      upush(member.tags, "멤버");
      upush(member.tags, "member");

      upush(member.tags, options.group);
      upush(member.tags, parse_hangul(options.group));

      var groupnick = get_user_nick(options.group);
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

  if (member.names) {
    member.names.forEach((name) => {
      upush(member.tags, name.hangul);
      upush(member.tags, name.roman);
    });
  }

  if (member.nicks) {
    member.nicks.forEach((name) => {
      upush(member.tags, name.hangul);
      upush(member.tags, name.roman);
    });
  }

  return member;
}

function parse_feeds_inner() {
  return new Promise((resolve, reject) => {
    Promise.all([read_feeds(), read_toml()]).then(
      () => {
        var obj = tree_to_object(feeds_json);
        var toplevel = obj;
        for (var i = 0; i < feeds_toml.general.path.length; i++) {
          if (feeds_toml.general.path[i] in toplevel) {
            toplevel = toplevel[feeds_toml.general.path[i]];
          } else {
            console.error("Unable to find path:" + feeds_toml.general.path[i]);
            reject();
            return;
          }
        }
        module.exports.toplevel_feed = toplevel;
        var instagram = toplevel;

        var groups = {};
        for (var folder in instagram) {
          if (typeof instagram[folder] !== "object")
            continue;

          for (var group in instagram[folder]) {
            if (typeof instagram[folder][group] !== "object" || in_ignoregroups(group))
              continue;
            groups[group] = instagram[folder][group];
          }
        }

        var members = [];

        for (var group in groups) {
          /*console.log(group);
            console.log(parse_hangul(group));
            console.log("---");*/

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
                  members.push(parse_member(exes[ex], {ex: true, group: group}));
                }
              }
              members.push(parse_member(member_obj, {group: group}));
            }
          } else {
            members.push(parse_member(groups[group]));
          }

          //console.log("");
        }

        resolve(members);
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
