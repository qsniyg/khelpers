'use strict';

var kroman = require('kroman');

module.exports = {};

var fs = require('fs');
var toml = require('toml');
const monk = require('monk');
var db = monk("localhost/webrssview?auto_reconnect=true");
var db_feeds = db.get("feeds");
var path = require('path');

var feeds_json;
var feeds_toml;

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

  /*return new Promise((resolve, reject) => {
    var content = fs.readFileSync("feeds.json");
    feeds_json = JSON.parse(content);
    resolve(feeds_json);
  });*/
}

function read_toml() {
  return new Promise((resolve, reject) => {
    var content = fs.readFileSync(path.resolve(__dirname, "feeds.toml"));
    try {
      feeds_toml = toml.parse(content);
      resolve(feeds_toml);
    } catch (e) {
      console.error("Parsing error on line " + e.line + ", column " + e.column +
                    ": " + e.message);
      reject();
    }
  });
}

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

function get_user_roman(text) {
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

function parse_hangul(text, force) {
  if (!force) {
    var roman = get_user_roman(text);
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

function parse_hangul_first(text) {
  text = parse_hangul(text);
  if (text instanceof Array)
    return text[0];
  return text;
}
module.exports.parse_hangul_first = parse_hangul_first;

function parse_hangul_obj(text) {
  return {
    hangul: text,
    roman: parse_hangul(text)
  };
}

function is_hangul(charcode) {
  return charcode >= 0xAC00 && charcode <= 0xD7AF;
}

function parse_name(text) {
  var roman = get_user_roman(text);
  if (roman)
    return roman;

  if (!is_hangul(text.charCodeAt(0)))
    return parse_hangul(text);

  var lastname = parse_hangul(text[0]);
  if (lastname === "Gim") {
    lastname = "Kim";
  } else if (lastname === "I") {
    lastname = "Lee";
  } else if (lastname === "Bak") {
    lastname = "Park";
  } else if (lastname === "Im") {
    lastname = "Lim";
  } else if (lastname === "O") {
    lastname = "Oh";
  } else if (lastname === "Jeong") {
    lastname = "Jung";
  } else if (lastname === "No") {
    lastname = "Noh";
  } else if (lastname === "Gang") {
    lastname = "Kang";
  } else if (lastname === "Ham") {
    lastname = "Hahm";
  } else if (lastname === "Choe") {
    lastname = "Choi";
  }
  var retval = lastname + " " + parse_hangul(text.slice(1));
  //console.log(text);
  //console.log(retval);
  return retval;
}
module.exports.parse_name = parse_name;

function parse_name_obj(text) {
  return {
    hangul: text,
    roman: parse_name(text)
  };
}


function strip(x) {
  return x.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
}

function get_name(text) {
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
        ret.names.push(parse_name_obj(x));
      });

      alt.nicks.forEach((x) => {
        ret.nicks.push(parse_hangul_obj(x));
      });

      return ret;
    } else {
      return text;
    }
  }

  text = strip(text);
  if (text.indexOf(" ") >= 0) {
    var splitted = text.split(" ");
    var ssplitted = splitted[0].split("/");
    ssplitted.forEach((x) => {
      ret.names.push(parse_name_obj(x));
    });

    ssplitted = splitted[1].replace(/^\(/, "").replace(/\)$/, "").split("/");
    ssplitted.forEach((x) => {
      ret.nicks.push(parse_hangul_obj(x));
    });
  } else {
    if (text.length > 2 && is_hangul(text.charCodeAt(0)) && get_user_nick(text) !== false) {
      ret.names.push(parse_name_obj(text));
      ret.nicks.push(parse_hangul_obj(text.slice(1)));
    } else {
      ret.nicks.push(parse_hangul_obj(text));
    }
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

function parse_member(obj, options) {
  var member = {
  };

  if ("$$parent" in obj)
    return;

  member.alt = obj.name;

  var name = get_name(obj.name);
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

function parse_feeds() {
  return new Promise((resolve, reject) => {
    parse_feeds_inner()
      .then(
        (members) => {
          db.close();
          resolve(members);
        })
      .catch(
        (data) => {
          db.close();
          reject(data);
        }
      );
  });
}
module.exports.parse_feeds = parse_feeds;
