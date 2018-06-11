'use strict';

var parse_feeds = require('./parse_feeds');
var cheerio = require('cheerio');
var expandHomeDir = require('expand-home-dir');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var request = require('request');
//request = request.defaults({jar: true});
//require('request-debug')(request);
var readlineSync = require('readline-sync');
var imgur = require('imgur');
var urljoin = require('url-join');
var naturalSort = require('javascript-natural-sort');
var wrap = require('word-wrap');
var moment = require('moment-timezone');
var twitter = require('twitter-text');
var Twit = require('twit');
var T;
const Snoowrap = require('snoowrap');
var google = require('googleapis');
var google_oauth = require('./google_oauth');
var showdown  = require('showdown');
showdown.setOption("simplifiedAutoLink", true);
showdown.setOption("literalMidWordUnderscores", true);
var showdown_converter = new showdown.Converter();

//require('dotenv').config();

var tz_offset = 9; // KST
var tz_name = "Asia/Seoul";
moment.tz.setDefault(tz_name);

var weibo_userids_to_usernames = {};

function reset_date(d) {
  var m = moment();
  if (d)
    m = moment(d);
  return m.startOf("day").toDate();
  /*d.setUTCHours(tz_offset);
  d.setUTCMinutes(0);
  d.setUTCSeconds(0);
  d.setUTCMilliseconds(0);*/
}

function parse_timestamp(timestamp, end) {
  /*var d = new Date();
    d = reset_date(d);*/

  var m;

  if (!end)
    m = moment().startOf("day");
  else
    m = moment().endOf("day");

  var year = parseInt("20" + timestamp.slice(0, 2), 10);
  //d.setUTCFullYear(year);
  m.year(year);

  var month = parseInt(timestamp.slice(2, 4), 10) - 1;
  //d.setUTCMonth(month);
  m.month(month);

  var date = parseInt(timestamp.slice(4, 6), 10);
  //d.setUTCDate(date);
  m.date(date);

  //return d;
  return m.toDate();
}

function spawn_editor(filename) {
  var editor = parse_feeds.feeds_toml.general.editor;
  var editorargs = editor.slice(1);
  editorargs.push(filename);
  spawn(editor[0], editorargs, {
    stdio: 'ignore',
    detached: true
  }).unref();
}

/*function get_feed_urls(feed) {
  if (!feed) {
    console.log("can't find feed");
    return;
  }

  var ret = [];

  if (!feed.$$parent) {
    ret.push(feed.url);
  } else {
    for (var child in feed) {
      ret.push.apply(ret, get_feed_urls(feed[child]));
    }
  }

  var newret = [];
  ret.forEach((value) => {
    if (value)
      newret.push(value);
  });

  return newret;
}

function find_feed(feed, name) {
  if (feed.name === name)
    return feed;

  if (feed.$$parent) {
    for (var child in feed) {
      if (child === name)
        return feed[child];

      var value = find_feed(feed[child], name);
      if (value)
        return value;
    }
  }

  return null;
  }*/

function find_members_by_group(members, group) {
  var ret = [];
  var ignore_instagram = parse_feeds.feeds_toml.instagram.ignore_sns || [];
  var ignore_twitter = parse_feeds.feeds_toml.twitter.ignore_sns || [];
  var ignore_weibo = parse_feeds.feeds_toml.weibo.ignore_sns || [];
  var ignoreex = parse_feeds.feeds_toml.general.ignore_ex || [];

  for (var i = 0; i < members.length; i++) {
    var member = members[i];

    if (!member)
      continue;

    /*if (member.instagram_obj && ignore_instagram.indexOf(get_username_from_rssit_url(member.instagram_obj.url)) >= 0)
      continue;

    if (member.twitter_obj && ignore_twitter.indexOf(get_username_from_rssit_url(member.twitter_obj.url)) >= 0)
      continue;

    if (member.weibo_obj && ignore_weibo.indexOf(get_username_from_rssit_url(member.weibo_obj.url)) >= 0)
    continue;*/
    var ignore = false;
    for (var j = 0; j < member.accounts.length; j++) {
      var username = member.accounts[j].username.toLowerCase();
      if ((member.accounts[j].site === "instagram" && ignore_instagram.indexOf(username) >= 0) ||
          (member.accounts[j].site === "twitter" && ignore_twitter.indexOf(username) >= 0) ||
          (member.accounts[j].site === "weibo" && ignore_weibo.indexOf(username) >= 0)) {
        ignore = true;
        break;
      }
    }

    if (ignore)
      continue;

    if (member.alt !== group &&
        member.group !== group &&
        (!member.nicks || !member.nicks[0] || member.nicks[0].hangul !== group || member.group)) {
      continue;
    }

    if (member.ex && ignoreex.indexOf(group) >= 0)
      continue;

    ret.push(member);
  }

  return ret;
}

// from: https://stackoverflow.com/a/11598864/999400
// removes emoji
const non_printable_re = /[\0-\x1F\x7F-\x9F\xAD\u0378\u0379\u037F-\u0383\u038B\u038D\u03A2\u0528-\u0530\u0557\u0558\u0560\u0588\u058B-\u058E\u0590\u05C8-\u05CF\u05EB-\u05EF\u05F5-\u0605\u061C\u061D\u06DD\u070E\u070F\u074B\u074C\u07B2-\u07BF\u07FB-\u07FF\u082E\u082F\u083F\u085C\u085D\u085F-\u089F\u08A1\u08AD-\u08E3\u08FF\u0978\u0980\u0984\u098D\u098E\u0991\u0992\u09A9\u09B1\u09B3-\u09B5\u09BA\u09BB\u09C5\u09C6\u09C9\u09CA\u09CF-\u09D6\u09D8-\u09DB\u09DE\u09E4\u09E5\u09FC-\u0A00\u0A04\u0A0B-\u0A0E\u0A11\u0A12\u0A29\u0A31\u0A34\u0A37\u0A3A\u0A3B\u0A3D\u0A43-\u0A46\u0A49\u0A4A\u0A4E-\u0A50\u0A52-\u0A58\u0A5D\u0A5F-\u0A65\u0A76-\u0A80\u0A84\u0A8E\u0A92\u0AA9\u0AB1\u0AB4\u0ABA\u0ABB\u0AC6\u0ACA\u0ACE\u0ACF\u0AD1-\u0ADF\u0AE4\u0AE5\u0AF2-\u0B00\u0B04\u0B0D\u0B0E\u0B11\u0B12\u0B29\u0B31\u0B34\u0B3A\u0B3B\u0B45\u0B46\u0B49\u0B4A\u0B4E-\u0B55\u0B58-\u0B5B\u0B5E\u0B64\u0B65\u0B78-\u0B81\u0B84\u0B8B-\u0B8D\u0B91\u0B96-\u0B98\u0B9B\u0B9D\u0BA0-\u0BA2\u0BA5-\u0BA7\u0BAB-\u0BAD\u0BBA-\u0BBD\u0BC3-\u0BC5\u0BC9\u0BCE\u0BCF\u0BD1-\u0BD6\u0BD8-\u0BE5\u0BFB-\u0C00\u0C04\u0C0D\u0C11\u0C29\u0C34\u0C3A-\u0C3C\u0C45\u0C49\u0C4E-\u0C54\u0C57\u0C5A-\u0C5F\u0C64\u0C65\u0C70-\u0C77\u0C80\u0C81\u0C84\u0C8D\u0C91\u0CA9\u0CB4\u0CBA\u0CBB\u0CC5\u0CC9\u0CCE-\u0CD4\u0CD7-\u0CDD\u0CDF\u0CE4\u0CE5\u0CF0\u0CF3-\u0D01\u0D04\u0D0D\u0D11\u0D3B\u0D3C\u0D45\u0D49\u0D4F-\u0D56\u0D58-\u0D5F\u0D64\u0D65\u0D76-\u0D78\u0D80\u0D81\u0D84\u0D97-\u0D99\u0DB2\u0DBC\u0DBE\u0DBF\u0DC7-\u0DC9\u0DCB-\u0DCE\u0DD5\u0DD7\u0DE0-\u0DF1\u0DF5-\u0E00\u0E3B-\u0E3E\u0E5C-\u0E80\u0E83\u0E85\u0E86\u0E89\u0E8B\u0E8C\u0E8E-\u0E93\u0E98\u0EA0\u0EA4\u0EA6\u0EA8\u0EA9\u0EAC\u0EBA\u0EBE\u0EBF\u0EC5\u0EC7\u0ECE\u0ECF\u0EDA\u0EDB\u0EE0-\u0EFF\u0F48\u0F6D-\u0F70\u0F98\u0FBD\u0FCD\u0FDB-\u0FFF\u10C6\u10C8-\u10CC\u10CE\u10CF\u1249\u124E\u124F\u1257\u1259\u125E\u125F\u1289\u128E\u128F\u12B1\u12B6\u12B7\u12BF\u12C1\u12C6\u12C7\u12D7\u1311\u1316\u1317\u135B\u135C\u137D-\u137F\u139A-\u139F\u13F5-\u13FF\u169D-\u169F\u16F1-\u16FF\u170D\u1715-\u171F\u1737-\u173F\u1754-\u175F\u176D\u1771\u1774-\u177F\u17DE\u17DF\u17EA-\u17EF\u17FA-\u17FF\u180F\u181A-\u181F\u1878-\u187F\u18AB-\u18AF\u18F6-\u18FF\u191D-\u191F\u192C-\u192F\u193C-\u193F\u1941-\u1943\u196E\u196F\u1975-\u197F\u19AC-\u19AF\u19CA-\u19CF\u19DB-\u19DD\u1A1C\u1A1D\u1A5F\u1A7D\u1A7E\u1A8A-\u1A8F\u1A9A-\u1A9F\u1AAE-\u1AFF\u1B4C-\u1B4F\u1B7D-\u1B7F\u1BF4-\u1BFB\u1C38-\u1C3A\u1C4A-\u1C4C\u1C80-\u1CBF\u1CC8-\u1CCF\u1CF7-\u1CFF\u1DE7-\u1DFB\u1F16\u1F17\u1F1E\u1F1F\u1F46\u1F47\u1F4E\u1F4F\u1F58\u1F5A\u1F5C\u1F5E\u1F7E\u1F7F\u1FB5\u1FC5\u1FD4\u1FD5\u1FDC\u1FF0\u1FF1\u1FF5\u1FFF\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2072\u2073\u208F\u209D-\u209F\u20BB-\u20CF\u20F1-\u20FF\u218A-\u218F\u23F4-\u23FF\u2427-\u243F\u244B-\u245F\u2700\u2B4D-\u2B4F\u2B5A-\u2BFF\u2C2F\u2C5F\u2CF4-\u2CF8\u2D26\u2D28-\u2D2C\u2D2E\u2D2F\u2D68-\u2D6E\u2D71-\u2D7E\u2D97-\u2D9F\u2DA7\u2DAF\u2DB7\u2DBF\u2DC7\u2DCF\u2DD7\u2DDF\u2E3C-\u2E7F\u2E9A\u2EF4-\u2EFF\u2FD6-\u2FEF\u2FFC-\u2FFF\u3040\u3097\u3098\u3100-\u3104\u312E-\u3130\u318F\u31BB-\u31BF\u31E4-\u31EF\u321F\u32FF\u4DB6-\u4DBF\u9FCD-\u9FFF\uA48D-\uA48F\uA4C7-\uA4CF\uA62C-\uA63F\uA698-\uA69E\uA6F8-\uA6FF\uA78F\uA794-\uA79F\uA7AB-\uA7F7\uA82C-\uA82F\uA83A-\uA83F\uA878-\uA87F\uA8C5-\uA8CD\uA8DA-\uA8DF\uA8FC-\uA8FF\uA954-\uA95E\uA97D-\uA97F\uA9CE\uA9DA-\uA9DD\uA9E0-\uA9FF\uAA37-\uAA3F\uAA4E\uAA4F\uAA5A\uAA5B\uAA7C-\uAA7F\uAAC3-\uAADA\uAAF7-\uAB00\uAB07\uAB08\uAB0F\uAB10\uAB17-\uAB1F\uAB27\uAB2F-\uABBF\uABEE\uABEF\uABFA-\uABFF\uD7A4-\uD7AF\uD7C7-\uD7CA\uD7FC-\uF8FF\uFA6E\uFA6F\uFADA-\uFAFF\uFB07-\uFB12\uFB18-\uFB1C\uFB37\uFB3D\uFB3F\uFB42\uFB45\uFBC2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDEF\uFDFE\uFDFF\uFE1A-\uFE1F\uFE27-\uFE2F\uFE53\uFE67\uFE6C-\uFE6F\uFE75\uFEFD-\uFF00\uFFBF-\uFFC1\uFFC8\uFFC9\uFFD0\uFFD1\uFFD8\uFFD9\uFFDD-\uFFDF\uFFE7\uFFEF-\uFFFB\uFFFE\uFFFF]/g;

function trim_text(text) {
  if (!text)
    return text;

  return text/*.replace(non_printable_re, "")*/.replace(/^\s+|\s+$/g, '');
}

function get_shortcode_from_url(url) {
  return url.replace(/.*\/p\/([^/?&]*)\/*$/, "$1");
}

function get_instagram_rssit_url(url) {
  return 'http://localhost:8123/f/instagram/raw/p/' + get_shortcode_from_url(url) + "?output=raw";
}

var instagram_username_names = {};
var twitter_username_names = {};
var weibo_username_names = {};
var link_names = {};

function comment_to_text(comment) {
  var text = "-\n\n[@" + escape_text(comment.owner.username) + "](https://www.instagram.com/" + comment.owner.username + "/)";
  if (comment.owner.username in instagram_username_names) {
    text += " *(" + instagram_username_names[comment.owner.username].toLowerCase() + ")*";
  }
  text += "\n\n" + quote_text(escape_text(comment.text));

  if (parse_feeds.has_hangul(comment.text)) {
    text += "\n\nenglish:\n\n" + quote_text(escape_text(comment.text));
  }

  text += "\n\n";
  return text;
}

function unescape_text(text) {
  return text
    .replace(/\\\\/g, "\\")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\~/g, "~")
    .replace(/\\\*/g, "*")
    .replace(/\\\./g, ".")
    .replace(/\\\^/g, "^")
    .replace(/\\\[/g, "[");
}

function markdown_to_text(text) {
  if (!text)
    return text;

  var newtext = "";
  var lastline = undefined;
  text.split("\n").forEach((line) => {
    if (line[0] === ">")
      line = line.substr(1);

    line = trim_text(line);

    if (line === "") {
      if (lastline !== "") {
        newtext += "\n";
      }
      lastline = line;
      return;
    }

    lastline = line;

    if (line === "-") {
      return;
    }

    line = line.replace(/\[(.*?)]\([^)]*\)/g, "$1");
    newtext += unescape_text(line) + " ";
  });

  var newtext1 = [];
  newtext.split("\n").forEach((line) => {
    newtext1.push(trim_text(line));
  });

  return trim_text(newtext1.join("\n"));
}

function markdown_to_html(text) {
  return showdown_converter.makeHtml(text)
    .replace(/<p> *- *<\/p>/g, "<br />");
}

var markdown_control = {
  "#": "\\#",
  "_": "\\_",
  "~": "\\~",
  "*": "\\*",
  ".": "\\.",
  "^": "\\^"
};

var special_markdown_control = {
  "\\": "\\\\",
  "[": "\\["
};

function escape_text(text, redo) {
  if (redo === undefined)
    redo = true;

  var newtext = "";
  var in_link = false;
  var linkpart = 0;
  var escape = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];

    if (ch in special_markdown_control) {
      if (redo) {
        newtext += "\\";
      } else if (!escape) {
        if (ch === "\\")
          escape = true;
        else if (ch === "[")
          linkpart = 1;
      }
    }

    if (escape || in_link || linkpart >= 2) {
    } else {
      if (ch in markdown_control) {
        newtext += "\\";
      }
    }

    if (!escape && !redo && linkpart >= 1) {
      if (linkpart === 1 && ch === "]")
        linkpart++;
      if (linkpart === 2 && ch === "(")
        linkpart++;
      if (linkpart === 3 && ch === ")")
        linkpart = 0;
    }

    if (newtext.match(/https?:\/\/$/))
      in_link = true;

    if (ch !== "\\")
      escape = false;

    newtext += ch;
  }

  /*var newtext = text
      .replace(/\\/g, "\\\\")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\~")
      .replace(/\*\/g, "\\*") // fixwhen uncommenting
      .replace(/\./g, "\\.")
      .replace(/\^/g, "\\^");*/
  var splitted = newtext.split(" ");
  var newsplitted = [];
  splitted.forEach((split) => {
    if (split[0] === "@") {
      // https://stackoverflow.com/a/17087528
      // [a-zA-Z0-9_.]
      var split_username = split.replace(/^@([a-zA-Z0-9_.]+).*?$/, "$1");
      var split_rest = split.replace(/^@[a-zA-Z0-9_.]+(.*?)$/, "$1");
      newsplitted.push("[@" + split_username + "](https://www.instagram.com/" + unescape_text(split_username) + "/)" + split_rest);
    } else {
      newsplitted.push(split);
    }
  });
  return newsplitted.join(" ");
}

function quote_text(text) {
  if (trim_text(text) === "")
    return ">-";
  else
    return ">" + wrap(text, {width: 60, indent:'', newline:'\n>'});
}

function get_username_from_rssit_url(url) {
  return url.replace(/.*\/(?:instagram|twitter|weibo)\/u\/([^/?&]*).*$/, "$1");
}

function get_home_from_rssit_url(url) {
  if (url.indexOf("/instagram/") >= 0)
    return "https://www.instagram.com/" + get_username_from_rssit_url(url) + "/";
  else if (url.indexOf("/twitter/") >= 0)
    return "https://twitter.com/" + get_username_from_rssit_url(url);
  else if (url.indexOf("/weibo/u/") >= 0)
    return "http://weibo.com/u/" + get_username_from_rssit_url(url);
}

// https://stackoverflow.com/a/28149561
function date_to_isotime(date) {
  var tzoffset = (new Date(date)).getTimezoneOffset() * 60000;
  return (new Date(date - tzoffset)).toISOString().slice(0, -1).replace(/\.[0-9]*$/, "");
}

var errors = [];

function do_promise(fn, cb, cberr) {
  return new Promise((resolve, reject) => {
    fn().then(
      (data) => {
        cb(data);
        resolve();
      },
      (err) => {
        console.dir(err);
        errors.push(err);
        cberr(err);
        resolve();
        //reject(err);
      }
    );
  });
}

var streamable_username;
var streamable_password;

function upload_video_old(video) {
  if (false) {
    var chance = new require('chance')();
    return new Promise((resolve, reject) => {
      //resolve({video_link:"https://fakestreamable.com/" + chance.string()});
      resolve({shortcode: chance.string()});
    });
  }


  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(video);
    const data = { file: stream, title: path.parse(video).name };
    request('https://api.streamable.com/upload', {
      method: 'POST',
      formData: data,
      auth: {
        username: streamable_username,
        password: streamable_password
      }
    }, (error, response, data) => {
      if (error) {
        console.dir(error);
        reject(error);
        return;
      }
      /*console.dir(error);
      console.dir(data);*/

      resolve(JSON.parse(data));
    });
  });
}

var ranalready = false;
function upload_video(video) {
  if (false) {
    var chance = new require('chance')();
    return new Promise((resolve, reject) => {
      //resolve({video_link:"https://fakestreamable.com/" + chance.string()});
      resolve({shortcode: chance.string()});
    });
  }

  /*if (ranalready)
    return;*/
  ranalready = true;
  var apiurl = "https://ajax.streamable.com/";
  var title = path.parse(video).name;
  var jar = request.jar();
  var request_binks = request.defaults({jar: jar});
  return new Promise((resolve, reject) => {
    var stat = fs.statSync(video);
    request_binks(apiurl + "shortcode?size=" + stat.size/* + "&speed=537"*/, {},
            (error, response, data) => {
              if (error) {
                console.dir(error);
                reject(error);
                return;
              }

              var json = JSON.parse(data);
              //console.dir(json);
              var shortcode = json.shortcode;
              var uploadurl = json.url;
              if (uploadurl.startsWith("//"))
                uploadurl = "https:" + uploadurl;
              var token = json.fields.token;
              var basedata = json.options;/*{
                "preset": "mp4",
                "shortcode": shortcode,
                "screenshot": true,
                "upload_source": "web",
                "token": json.fields.token
              };*/
              var transcodereq = false;
              if (!token && json.transcoder_options) {
                //uploadurl = json.transcoder_options.url;
                //token = json.transcoder_options.token;
                basedata = json.fields;
                transcodereq = json.transcoder_options;
              } else {
                basedata.upload_source = "web";
                for (var field in json.fields)
                  basedata[field] = json.fields[field];
                //basedata.token = json.fields.token;
              }
              var fields = json.fields;
              //console.log(uploadurl);
              //console.log(token);
              request_binks(apiurl + "videos/" + shortcode, {
                method: 'PATCH',
                body: {
                  "original_name": title,
                  "original_size": stat.size,
                  "title": title,
                  "upload_source": "web"
                },
                json: true
              }, (error, response, data) => {
                if (error) {
                  console.log("ERR2");
                  console.dir(error);
                  reject(error);
                  return;
                }

                //console.log("2");
                //console.dir(data);

                const stream = fs.createReadStream(video);
                var formdata = basedata;
                formdata["file"] = stream;
                //console.dir(formdata);//{
                  //"file": stream,
                  /*"preset": "mp4",
                  "shortcode": shortcode,
                  "screenshot": true,
                  "upload_source": "web",*/
                  //"token": token
              //};
                      /*for (var key in basedata) {
                  formdata[key] = basedata[key];
                }*/
                //console.dir(formdata);

                request_binks.post({
                  url: uploadurl,
                  //method: 'POST',
                  formData: formdata
                }, (error, response, data) => {
                  //console.log("3");
                  //console.dir(data);
                  if (!transcodereq)
                    resolve({"shortcode": shortcode});
                  else {
                    var reqbody = json.options;
                    for (var key in transcodereq) {
                      reqbody[key] = transcodereq[key];
                    }
                    request_binks.post(apiurl + "transcode/" + shortcode, {
                      body: reqbody,
                      json: true
                    }, (error, response, data) => {
                      if (error) {
                        console.log("ERROR");
                        console.dir(error);
                      }
                      //console.log("4");
                      //console.dir(data);
                      resolve({"shortcode": shortcode, "url": "https://streamable.com/" + shortcode});
                    });
                  }
                });
              });
            });
  });
}

var uploaded_images = {};
var images_times_ran = 0;

function create_imgur_album(deletehashes) {
  return new Promise((resolve, reject) => {
    var images = [];
    Object.keys(deletehashes).sort(naturalSort).forEach((key) => {
      images.push(deletehashes[key]);
    });

    imgur._getAuthorizationHeader().then((authHeader) => {
      var options  = {
        uri: 'https://api.imgur.com/3/album',
        method: 'POST',
        encoding: 'utf8',
        json: true,
        headers: {
          Authorization: authHeader,
        },
        body: {
          "deletehashes": images.join(",")
        }
      };

      console.dir(options);

      var r = request(options, (err, res, body) => {
        if (err) {
          reject(err);
        } else if (body && !body.success) {
          reject({status: body.status, message: body.data ? body.data.error : 'No body data response'});
        } else {
          resolve(body);
        }
      });
    });
  });
}

function upload_images(images) {
  images_times_ran++;
  if (false) {
    var chance = new require('chance')();
    if (Object.keys(images).length === 1) {
      return new Promise((resolve, reject) => {
        resolve({data:{link:"https://fakeimgur.com/" + chance.string(),deletehash:chance.string()}});
      });
    } else {
      return new Promise((resolve, reject) => {
        resolve({data:{id: chance.string()}});
      });
    }

    return;
  }

  return new Promise((resolve, reject) => {
    var promises = [];

    var our_album = null;
    var promise = null;
    var images_length = Object.keys(images).length;
    if (images_length > 1) {
      if (images !== uploaded_images) {
        //promise = imgur.createAlbum();
        promise = new Promise((resolve, reject) => {
          resolve();
        });
      } else {
        // 2, including this time
        if (Object.keys(uploaded_images).length === 0 || images_times_ran <= 2) {
          resolve(null);
          return null;
        }

        create_imgur_album(images).then(
          (data) => {
            resolve(data);
          },
          (err) => {
            reject(err);
          }
        );
        return;
      }
    } else {
      promise = new Promise((resolve, reject) => {
        resolve();
      });
    }

    promise.then(
      (album) => {
        our_album = album;
        var current_images = {};
        for (var key in images) {
          var image = images[key];
          var readStream = fs.createReadStream(image);
          readStream.on('error', reject);
          var params = {};
          if (album)
            params = {album: album.data.deletehash};

          (function(key) {
            promises.push(new Promise((resolve, reject) => {
              imgur._imgurRequest('upload', readStream, params).then(
                (data) => {
                  console.log(data.data.deletehash);
                  uploaded_images[key] = data.data.deletehash;
                  current_images[key] = data.data.deletehash;
                  resolve(data);
                },
                (err) => {
                  reject(err);
                });
            }));
          })(key);
        }

        var newpromise = null;
        if (images_length === 1) {
          newpromise = promises[0];
        } else {
          newpromise = new Promise((resolve, reject) => {
            Promise.all(promises).then(
              () => {
                //resolve(our_album);
                create_imgur_album(current_images).then(
                  (data) => {
                    resolve(data);
                  },
                  (err) => {
                    reject(err);
                  }
                );
              },
              (err) => {
                reject(err);
              }
            );
          });
        }

        newpromise.then(
          (data) => {
            resolve(data);
          },
          (err) => {
            reject(err);
          }
        );
        //return newpromise;
      },
      (err) => {
        reject(err);
      }
    );
  });
}

function process_extra(splitted, extra) {
  console.log("Replacing " + Object.keys(extra).length + " lines");
  /*if ((i - origi) !== extra.length) {
    console.error("Mismatching orig/mod length: " + (i - origi) + "/" + extra.length);
    }*/

  for (var i in extra) {
    splitted[i] = "\n" + extra[i];
  }

  splitted = splitted.join("\n").split("\n");
  var newsplitted = [];
  var lastline = null;
  splitted.forEach((line) => {
    if (trim_text(line) === "" && lastline === "")
      return;

    newsplitted.push(line);
    lastline = trim_text(line);
  });

  return newsplitted.join("\n");
}

function replace_lines(filename, splitted, extra, album) {
  var newtext = process_extra(splitted, extra);

  if (album) {
    newtext = "https://imgur.com/a/" + album.data.id + " - images below as an album\n\n" + newtext;
  }

  console.log(filename + "_mod");
  fs.writeFileSync(filename + "_mod", newtext);
  //spawn_editor(filename + "_mod");
}

function parse_txt(filename, splitted) {
  var users = {};
  var current_user = "";
  var fn_split = path.basename(filename).split("_");

  var group_hangul = fn_split[0];
  var groupname = parse_feeds.parse_hangul_first(group_hangul);

  var start = fn_split[1];
  var end = fn_split[2].replace(/[^0-9]*/g, "");

  var grouplower = groupname.toLowerCase();

  var group_alts = [];
  parse_feeds.members.forEach((member) => {
    if (!member)
      return;
    if (member.alt !== group_hangul)
      return;
    member.names.forEach((name) => {
      group_alts.push(name.roman_first.toLowerCase());
    });
  });

  var group_members = find_members_by_group(parse_feeds.members, group_hangul);

  var items_count = 0;

  for (var i = 0; i < splitted.length; i++) {
    var userreg = splitted[i].match(/^## *(.*?) *$/);
    if (userreg) {
      current_user = userreg[1];
      users[current_user] = [];
      continue;
    }

    if (!splitted[i].match(/^https?:\/\/[^/.]*\.instagram\.com\//) &&
        !splitted[i].match(/^https?:\/\/([^/.]*\.)?weibo\.com\//) &&
        !splitted[i].match(/^https?:\/\/[^/.]*cdninstagram\.com\//) &&
        !splitted[i].match(/^https?:\/\/instagram\..*\.fbcdn\.net\//) &&
        !splitted[i].match(/^https?:\/\/(?:www\.)?twitter\.com\//) &&
        !splitted[i].match(/^https?:\/\/(?:www\.)?weibo\.com\//) &&
        !splitted[i].match(/^https?:\/\/([^/.]*\.)?imgur\.com\//) &&
        !splitted[i].match(/^https?:\/\/([^/.]*\.)?streamable\.com\//)) {
      continue;
    }

    if (splitted[i].match(/ - images below as an album/))
      continue;
    /*if (!splitted[i].match(/^https?:\/\/www\.instagram\.com\//) &&
        splitted[i].indexOf("://guid.instagram.com") < 0) {
      continue;
    }*/

    var org_spli = trim_text(splitted[i]);
    var url = splitted[i].replace(/([^ ]+) +.*/, "$1");
    var anyurl = url;
    var annotation = trim_text(splitted[i].replace(/.* +- +(.*?)/, "$1"));
    if (annotation === org_spli)
      annotation = null;
    else
      annotation = trim_text(annotation.replace(/\[([0-9]+)\] *$/, ""));
    var timestamp = trim_text(splitted[i].replace(/.* +\[([0-9]+)\].*/, "$1"));
    if (timestamp === org_spli)
      timestamp = null;

    var origi = i;
    i++;
    var images = {};
    var videos = {};
    var type = "ig";
    var story = "";
    var is_title = false;
    var deleted = false;

    var site = "instagram";
    if (url.indexOf("twitter.com/") >= 0)
      site = "twitter";
    else if (url.indexOf("weibo.com/") >= 0)
      site = "weibo";

    if (annotation && annotation.match(/title/)) {
      is_title = true;
    }

    if (splitted[i-1].indexOf("://guid.instagram.com") >= 0 ||
        (annotation && annotation.match(/story/))) {
      if (splitted[i-1].indexOf("://guid.instagram.com") >= 0)
        url = "";
      story = "story, ";
      type = "story";
    } else if ((splitted[i-1].match(/https?:\/\/[^/.]*cdninstagram\.com\//)) ||
               (splitted[i-1].match(/https?:\/\/instagram\..*\.fbcdn\.net\//)) ||
               (annotation && annotation.match(/new profile/))) {
      story = "new profile ";
      type = "dp";
    }

    if (annotation && annotation.match(/deleted/)) {
      deleted = true;
    }

    for (; i < splitted.length; i++) {
      if (trim_text(splitted[i]).length === 0) {
        break;
      }

      var file = expandHomeDir(splitted[i]);
      if (!fs.existsSync(file)) {
        console.error(file + " does not exist.");
        continue;
      } else {
        var key = i;
        /*console.log(story);
        console.log(key);
        console.log(origi);
        console.log("");*/
        /*if (story && key === (origi + 1)) {
          key--;
        }*/
        if (file.endsWith(".jpg"))
          images[key] = file;
        else if (file.endsWith(".mp4"))
          videos[key] = file;
        else
          console.error("Unknown extension for " + file);
      }
    }

    var origtext = "";
    var okenglish = true;
    var engtext = undefined;

    for (; i < splitted.length; i++) {
      if (splitted[i].match(/^\*\*\*\*\*/) ||
          splitted[i].match(/^\*comments/) ||
          splitted[i].match(/^\*/))
        break;

      if (splitted[i][0] === ">") {
        if (engtext === undefined) {
          origtext += splitted[i] + "\n";
        } else {
          engtext += splitted[i] + "\n";
        }
      } else if (splitted[i].match(/^english:/)) {
        if (splitted[i].match(/^english: *$/)) {
          okenglish = true;
        } else {
          okenglish = false;
        }
        engtext = "";
      }
    }

    for (; i < splitted.length; i++) {
      if (splitted[i].match(/^\*\*\*\*\*/) ||
          splitted[i].match(/^##/))
        break;
    }

    var usertext = "";

    var user = markdown_to_text(current_user);
    var userurl = current_user.replace(/.*\((http[^)]*)\).*/, "$1");
    var usersite = userurl.replace(/^https?:\/\/(?:[a-z]*\.)?([^/.]*)\..*/, "$1");
    var username = userurl.replace(/.*\.com\/([^/]*).*?$/, "$1");
    if (usersite === "weibo" && username === "u")
      username = userurl.replace(/.*\.com\/u\/([^/]*).*?$/, "$1");
    if (user.match(/\(.*'s/)) {
      // family member
      usertext = user.replace(/\(/, "(" + groupname.toLowerCase() + " ");
    } else {
      usertext = groupname.toLowerCase() + " " + user;
      if (current_user === groupname.toLowerCase() || group_alts.indexOf(user) >= 0)
        usertext = user;//groupname.toLowerCase();
    }

    var member = null;
    for (var x = 0; x < group_members.length; x++) {
      var newusernames = [];
      group_members[x].accounts.forEach((account) => {
        if (account.site === usersite)
          newusernames.push(account.username.toLowerCase());
      });
      /*if (group_members[x].instagram_obj && usersite === "instagram")
        newusername = get_username_from_rssit_url(group_members[x].instagram_obj.url);
      if (group_members[x].twitter_obj && usersite === "twitter")
        newusername = get_username_from_rssit_url(group_members[x].twitter_obj.url);
      if (group_members[x].weibo_obj && usersite === "weibo")
        newusername = get_username_from_rssit_url(group_members[x].weibo_obj.url);*/

      //var newusername = get_username_from_rssit_url(group_members[x].instagram_obj.url);
      //if (username.toLowerCase() === newusername.toLowerCase()) {
      if (newusernames.indexOf(username.toLowerCase()) >= 0) {
        member = group_members[x];
        break;
      }
    }

    users[current_user].push({
      "rawusertext": user,
      "usertext": usertext,
      "userurl": userurl,
      "username": username,
      "member": member,
      "type": type,
      "annotation": annotation,
      "timestamp": timestamp,
      "deleted": deleted,
      "site": site,
      "url": url,
      "anyurl": anyurl,
      "story": story,
      "is_title": is_title,
      "startline": origi,
      "endline": i,
      "contents": splitted.slice(origi, i),
      "images": images,
      "videos": videos,
      "okenglish": okenglish,
      "origtext": markdown_to_text(origtext),
      "engtext": markdown_to_text(engtext)
    });
    items_count++;
  }

  return {
    group_hangul,
    groupname,
    grouplower,
    group_alts,
    start,
    end,
    users,
    items_count
  };
}

function maximg(src) {
  if (src.indexOf("//") === 0)
    src = "https:" + src;

  var protocol_split = src.split("://");
  var protocol = protocol_split[0];
  var splitted = protocol_split[1].split("/");
  var domain = splitted[0];

  if (domain.indexOf("cdninstagram.com") >= 0 ||
      domain.match(/^instagram\..*\.fbcdn\.net/)) {
    return src; // doesn't work anymore
    var urlstart = "https://" + domain + "/";
    var has_t = false;
    for (var i = 0; i < splitted.length; i++) {
      splitted[i] = splitted[i].replace(/\?.*$/, "");
      if (splitted[i].match(/^t[0-9]+\.[0-9]+-[0-9]+$/)) {
        urlstart += splitted[i] + "/";
        has_t = true;
      } else if (splitted[i].match(/^[0-9_]*_[a-z]+\.[a-z0-9]+$/)) {
        if (!has_t) {
          urlstart += "/";
        }

        urlstart += splitted[i];
      }
    }
    return urlstart;
  }

  if (domain === "images.streamable.com") {
    return src.replace(/\?[^/]*$/, "");
  }

  if (domain === "pbs.twimg.com" &&
      src.indexOf("pbs.twimg.com/media/") >= 0) {
    return src
      .replace(/(\/[^?&]*)([^/]*)[?&]format=([^&]*)/, "$1.$3$2")
      .replace(/(\/[^?&]*)[?&][^/]*$/, "$1")
      .replace(/(:[^/]*)?$/, ":orig");
  }

  if (domain === "pbs.twimg.com" &&
      src.indexOf("pbs.twimg.com/profile_images/") >= 0) {
    return src.replace(/_bigger\.([^/_]*)$/, "\.$1").replace(/_normal\.([^/_]*)$/, "\.$1").replace(/_[0-9]+x[0-9]+\.([^/_]*)$/, "\.$1");
  }

  return src;
}

function update_blogger_main(filename, splitted) {
  var parsed = parse_txt(filename, splitted);

  var posts = [];

  var oneday = false;
  var day = parsed.start;
  if (parsed.start === parsed.end) {
    oneday = true;
  }

  var current_count = 0;

  for (var user_key in parsed.users) {
    var user = parsed.users[user_key];
    user.forEach((item) => {
      //console.dir(item);
      //console.dir(item.member.names);
      //console.dir(item.member.nicks);
      var ourday = day;
      if (item.timestamp)
        ourday = item.timestamp;

      if (item.type !== "ig" &&
          item.type !== "story") {
        current_count++;
        return;
      }

      var updatetext = "Update";
      if (item.type === "story")
        updatetext = "Story";

      var site = " Instagram ";
      if (item.site === "twitter")
        site = " Twitter ";
      else if (item.site === "weibo")
        site = " Weibo ";

      var title = item.member.title + site + updatetext + " [" + ourday + "]";

      var labels = [];
      labels.push("SNS");
      if (item.site === "instagram")
        labels.push("Instagram");
      else if (item.site === "twitter")
        labels.push("Twitter");
      else if (item.site === "weibo")
        labels.push("Weibo");
      if (item.engtext)
        labels.push("Translation");
      if (item.member.group) {
        labels.push(item.member.group);
        labels.push(parse_feeds.parse_hangul_first(item.member.group));
      }
      if (item.member.names[0]) {
        labels.push(item.member.names[0].hangul);
        labels.push(item.member.names[0].roman_first);
      }
      labels.push(item.member.nicks[0].hangul);
      labels.push(item.member.nicks[0].roman_first);

      var thumbnail = null;

      var contents_md = trim_text(item.contents.slice(1).join("\n"));
      var firstline = item.url;

      var promise = new Promise((resolve, reject) => {
        resolve();
      });

      function do_firstline(url) {
        if (!url) {
          return new Promise((resolve, reject) => {
            resolve();
          });
        }

        if (url.match(/imgur\.com.*\.jpg/)) {
          firstline = "<p><img src='" + url + "' /></p>";
          thumbnail = url;
          return new Promise((resolve, reject) => {
            resolve();
          });
        } else if (url.match(/imgur\.com\/a\/.*/)) {
          return new Promise((resolve, reject) => {
            var queryurl = 'https://api.imgur.com/oembed?url=' + url;
            request(queryurl, (error, response, body) => {
              if (error) {
                console.dir(error);
                return;
              }

              var data = JSON.parse(body);
              firstline = data.html;

              request(url, (error, response, body) => {
                if (error) {
                  console.dir(error);
                  return;
                }

                var cereal = cheerio.load(body);
                var img_src = cereal("link[rel='image_src']").attr("href");
                thumbnail = maximg(img_src);
                resolve();
              });
            });
          });
        } else if (url.match(/streamable\.com/)) {
          return new Promise((resolve, reject) => {
            var queryurl = 'https://api.streamable.com/oembed?url=' + url;
            request(queryurl, (error, response, body) => {
              if (error) {
                console.dir(error);
                return;
              }

              var data = JSON.parse(body);
              firstline = data.html;
              thumbnail = maximg(data.thumbnail_url);
              resolve();
            });
          });
        } else if (url.match(/instagram\.com\/p\//)) {
          return new Promise((resolve, reject) => {
            var shortcode = url.replace(/.*instagram\.com\/p\/([^/]*).*?$/, "$1");
            var queryurl = 'https://api.instagram.com/oembed/?url=https://instagr.am/p/' + shortcode;
            request(queryurl, (error, response, body) => {
              if (error) {
                console.dir(error);
                return;
              }

              if (trim_text(body) === "No Media Match") {
                if (shortcode.length < 20) {
                  item.deleted = true;
                } else {
                  item["private"] = true;
                }
              } else {
                var data = JSON.parse(body);
                firstline = data.html;
                thumbnail = maximg(data.thumbnail_url);
              }

              var newurl = contents_md.split("\n")[0].match(/^(http[^ ]*)/);
              if (newurl) {
                newurl = newurl[1];
                do_firstline(newurl).then(
                  () => {
                    if (!item.deleted && !item["private"])
                      firstline = data.html;
                    resolve();
                  },
                  () => {
                    firstline = data.html;
                    thumbnail = maximg(data.thumbnail_url);
                    resolve();
                  }
                );
              } else {
                console.log("Can't find non-instagram URL");
                resolve();
              }
            });
          });
        } else if (url.match(/twitter\.com\//)) {
          return new Promise((resolve, reject) => {
            var queryurl = 'https://publish.twitter.com/oembed?url=' + url;
            request(queryurl, (error, response, body) => {
              if (error) {
                console.dir(error);
                return;
              }

              if (response.statusCode === 404) {
                item.deleted = true;
              } else {
                var data = JSON.parse(body);
                firstline = data.html;
              }

              var newurl = contents_md.split("\n")[0].match(/^(http[^ ]*)/);
              if (newurl) {
                newurl = newurl[1];
                do_firstline(newurl).then(
                  () => {
                    if (!item.deleted)
                      firstline = data.html;
                    resolve();
                  },
                  () => {
                    reject();
                  }
                );
              } else {
                console.log("Can't find non-twitter URL, must be a text post");
                //firstline = data.html;
                thumbnail = null;
                resolve();
              }
            });
          });
        } else {
          console.log("Unknown url: " + url);
          item["private"] = true;

          return new Promise((resolve, reject) => {
            var newurl = contents_md.split("\n")[0].match(/^(http[^ ]*)/);
            if (newurl) {
              newurl = newurl[1];
              do_firstline(newurl).then(
                () => {
                  firstline = "";
                  resolve();
                },
                () => {
                  reject();
                }
              );
            } else {
              console.log("Can't find any usable URL");
              firstline = null;
              thumbnail = null;
              reject();
            }
          });
        }
      }

      if (!item.deleted)
        promise = do_firstline(item.url);
      else {
        var newurl = contents_md.split("\n")[0].match(/^(http[^ ]*)/);
        if (newurl) {
          newurl = newurl[1];
          promise = do_firstline(newurl);
        } else {
          console.log("Can't find non-deleted URL");
          return;
        }
      }

      promise.then(() => {
        var contents = markdown_to_html(contents_md);
        var viatext = "";
        /*if (item.site === "instagram")
          viatext = "\n<p><em>(via <a href='https://www.instagram.com/" + item.username + "/' target='_blank'>" + item.username + "</a> on instagram)</em></p><br />\n";
        else if (item.site === "twitter")
          viatext = "\n<p><em>(via <a href='https://www.twitter.com/" + item.username + "' target='_blank'>@" + item.username + "</a> on twitter)</em></p><br />\n";
        else if (item.site === "weibo")
        viatext = "\n<p><em>(via <a href='https://www.weibo.com/" + item.username + "' target='_blank'>" + item.username + "</a> on weibo)</em></p><br />\n";*/

        // don't use viatext for now
        //viatext = "\n<p><em>(via <a href='" + item.member[item.site + "_obj"].link + "' target='_blank'>" + item.username + "</a> on " + item.site + ")</em></p><br />\n";
        contents = firstline + viatext + contents;

        if (item.deleted || item["private"]) {
          var deltxt = " <em>(deleted)</em>";
          if (item["private"])
            deltxt = "";
          var deletedtext = "<p><a href='" + item.url + "' target='_blank'>" + item.url + "</a>" + deltxt + "</p><br />\n";
          contents = deletedtext + contents;
        }

        var post = {
          title: title,
          content: contents,
          labels: labels
        };
        if (thumbnail) {
          post.content = "<img src='" + thumbnail + "' style='display:none' />" + post.content;
        }
        posts.push(post);
        current_count++;

        console.log(title);
        console.log("-----");
        console.log(post.content);
        console.log("-----");
        console.log(labels);
        console.log("-----");
        console.log("=====");

        if (current_count >= parsed.items_count) {
          do_blogger_posts(posts);
        }
      });
    });
  }
}

var blogger = null;
function do_blogger_posts(posts) {
  if (posts.length === 0) {
    console.log("Done");
    return;
  }

  if (!blogger) {
    google_oauth("blogger", null, function(auth) {
      blogger = google.blogger({
        version: 'v3',
        auth
      });
      do_blogger_posts(posts);
    });
  } else {
    console.dir(posts[0]);
    blogger.posts.insert({
      blogId: parse_feeds.feeds_toml.general.blogger_blogid,
      resource: posts[0]
    }, function (err, resp) {
      if (err) {
        console.log("ERROR");
        console.dir(err);
      }
      if (resp) {
        console.dir(resp);
        do_blogger_posts(posts.slice(1));
      }
    });
  }
}

function update_twitter_main(filename, splitted) {
  var parsed = parse_txt(filename, splitted);
  var group_hangul = parsed.group_hangul;
  var groupname = parsed.groupname;
  var grouplower = parsed.grouplower;
  var group_alts = parsed.group_alts;
  var users = parsed.users;

  var namespace = parse_feeds.feeds_toml.general;
  if (group_hangul in parse_feeds.feeds_toml) {
    namespace = parse_feeds.feeds_toml[group_hangul];
  }

  var tkey = namespace.twitter_key;
  var tsecret = namespace.twitter_secret;
  var taccess = namespace.twitter_access;
  var taccess_secret = namespace.twitter_access_secret;

  T = new Twit({
    consumer_key:         tkey,
    consumer_secret:      tsecret,
    access_token:         taccess,
    access_token_secret:  taccess_secret,
    timeout_ms:           60*1000,  // optional HTTP request timeout to apply to all requests.
  });

  //var users = {};
  //var current_user = "";
  /*
  var group_hangul = path.basename(filename).split("_")[0];
  var groupname = parse_feeds.parse_hangul_first(group_hangul);
  var grouplower = groupname.toLowerCase();

  var namespace = parse_feeds.feeds_toml.general;
  if (group_hangul in parse_feeds.feeds_toml) {
    namespace = parse_feeds.feeds_toml[group_hangul];
  }

  var tkey = namespace.twitter_key;
  var tsecret = namespace.twitter_secret;
  var taccess = namespace.twitter_access;
  var taccess_secret = namespace.twitter_access_secret;

  T = new Twit({
    consumer_key:         tkey,
    consumer_secret:      tsecret,
    access_token:         taccess,
    access_token_secret:  taccess_secret,
    timeout_ms:           60*1000,  // optional HTTP request timeout to apply to all requests.
  });

  var group_alts = [];
  parse_feeds.members.forEach((member) => {
    if (!member)
      return;
    if (member.alt !== group_hangul)
      return;
    member.names.forEach((name) => {
      group_alts.push(name.roman.toLowerCase());
    });
  });

  for (var i = 0; i < splitted.length; i++) {
    var userreg = splitted[i].match(/^## *(.*?) *$/);
    if (userreg) {
      current_user = userreg[1];
      users[current_user] = [];
      continue;
    }

    if (!splitted[i].match(/^https?:\/\/www\.instagram\.com\//) &&
        splitted[i].indexOf("://guid.instagram.com") < 0) {
      continue;
    }

    var url = splitted[i].replace(/ +- +.*\/, ""); // fix * /

    var origi = i;
    i++;
    var images = {};
    var videos = {};
    var story = "";

    if (splitted[i-1].indexOf("://guid.instagram.com") >= 0) {
      url = "";
      story = " story";
    }

    for (; i < splitted.length; i++) {
      if (trim_text(splitted[i]).length === 0) {
        break;
      }

      var file = expandHomeDir(splitted[i]);
      if (!fs.existsSync(file)) {
        console.error(file + " does not exist.");
        continue;
      } else {
        var key = i;
        /*console.log(story);
        console.log(key);
        console.log(origi);
        console.log("");*\/
        /*if (story && key === (origi + 1)) {
          key--;
        }*\/
        if (file.endsWith(".jpg"))
          images[key] = file;
        else if (file.endsWith(".mp4"))
          videos[key] = file;
        else
          console.error("Unknown extension for " + file);
      }
    }

    var origtext = "";
    var okenglish = true;
    var engtext = undefined;

    for (; i < splitted.length; i++) {
      if (splitted[i].match(/^\*\*\*\*\*\/) || // fix * /
          splitted[i].match(/^\*comments/) ||
          splitted[i].match(/^\*\/)) // fix * /
        break;

      if (splitted[i][0] === ">") {
        if (engtext === undefined) {
          origtext += splitted[i] + "\n";
        } else {
          engtext += splitted[i] + "\n";
        }
      } else if (splitted[i].match(/^english:/)) {
        if (splitted[i].match(/^english: *$/)) {
          okenglish = true;
        } else {
          okenglish = false;
        }
        engtext = "";
      }
    }

    users[current_user].push({
      "url": url,
      "story": story,
      "images": images,
      "videos": videos,
      "okenglish": okenglish,
      "origtext": markdown_to_text(origtext),
      "engtext": markdown_to_text(engtext)
    });
  }*/
  //console.dir(users);
  //return;

  for (var user in users) {
    console.log(user);
    users[user].forEach((item) => {
      if (!item.okenglish) {
        console.log("Skipping due to poor quality english");
        return;
      }

      var text = "[ig";
      if (item.site === "twitter")
        text = "[tw";
      else if (item.site === "weibo")
        text = "[weibo";

      if (item.type === "story")
        text += " story";
      else if (item.type === "dp")
        text = "[new ig profile image";
      else if (item.type !== "ig") {
        console.log("Unsupported item type: " + item.type);
        return;
      }
      if (item.engtext) {
        text += " trans";
      } else if (parse_feeds.feeds_toml.general.all_sns_group.indexOf(grouplower) < 0) {
        console.log("Skipping due to lack of english");
        return;
      }
      text += "] ";

      var usertext = "";

      user = markdown_to_text(user);
      if (user.match(/\(.*'s/)) {
        // family member
        usertext = user.replace(/\(/, "(" + groupname.toLowerCase() + " ");
      } else {
        usertext = groupname.toLowerCase() + " " + user;
        if (user === groupname.toLowerCase() || group_alts.indexOf(user) >= 0)
          usertext = user;//groupname.toLowerCase();
      }

      text += usertext;
      if (item.url)
        text += ": " + item.url;
      text += "\n\n";

      if (item.engtext) {
        text += item.engtext;
      } else {
        text += item.origtext;
      }

      var tweets = [];
      var freetweets = [];
      // https://github.com/twitter/twitter-text/blob/master/js/src/regexp/invalidCharsGroup.js
      var currenttext = text.normalize().replace(/[\uFFFE\uFEFF\uFFFF\u202A-\u202E]/g, "");
      while (true) {
        currenttext = trim_text(currenttext);
        /*for (var i = 0; i < currenttext.length; i++) {
          console.log(currenttext.charAt(i));
          console.log(currenttext.charCodeAt(i));
        }*/
        var parsed = twitter.parseTweet(currenttext);
        //console.dir(parsed);
        freetweets.push(tweets.length);
        if (parsed.validRangeEnd !== parsed.displayRangeEnd) {
          //console.log(currenttext.substr(0, parsed.validRangeEnd));
          for (var i = parsed.validRangeEnd - 4; i >= 0; i--) {
            if (currenttext[i].match(/[ \n\t.,!?#]/)) {
              /*if (trim_text(currenttext[i]) === "") {
                i--;
                }*/
              tweets.push({text:currenttext.substr(0, i) + " …"});
              currenttext = "@" + namespace.twitter_username + " " + trim_text(currenttext.substr(i));
              break;
            }
          }
        } else {
          tweets.push({text:currenttext});
          break;
        }
      }

      var images = [];
      for (var image in item.images) {
        images.push(item.images[image]);
      }

      var videos = [];
      for (var video in item.videos) {
        videos.push(item.videos[video]);
      }

      var addtweet = function(obj) {
        if (freetweets.length > 0) {
          console.dir(freetweets);
          for (var x in obj) {
            tweets[freetweets[0]][x] = obj[x];
          }
          //freetweets = freetweets.unshift();
          freetweets = freetweets.slice(1);
        } else {
          obj.text = "[continued]";
          tweets.push(obj);
        }
      };

      for (var i = 0; i < images.length; i += 4) {
        addtweet({images: images.slice(i, i + 4)});
      }

      for (var i = 0; i < videos.length; i++) {
        addtweet({videos: [videos[i]]});
      }

      //if (tweets.length > 1 && images.length === 10){
      console.dir(tweets);
      try {
        do_tweets(tweets);
      } catch (e) {
        console.dir(e);
      }
    //}
    });
  }
}

function do_tweets(tweets) {
  console.log("-------");
  console.log(tweets);
  console.log("-------");

  var do_tweet = function(x, tweetid) {
    if (tweets[x] === undefined) {
      if ((x + 1) < tweets.length) {
        console.log("Unable to post every tweet (" + (x + 1) + "/" + tweets.length + ")");
      } else {
        console.log("Finished");
      }
      return;
    }

    var media_promises = [];
    var medias = {};

    var upload_media = function(i, x) {
      return new Promise((resolve, reject) => {
        T.postMediaChunked({file_path: x}, function(err, data, response) {
          if (err) {
            console.log("Error uploading media " + x);
            console.log(err);
            reject(err);
            return;
          }

          medias[i] = data;
          resolve(data);
        });
      });
    };

    if (tweets[x].images) {
      for (var i = 0; i < tweets[x].images.length; i++) {
        media_promises.push(upload_media(i, tweets[x].images[i]));
      }
    } else if (tweets[x].videos) {
      for (var i = 0; i < tweets[x].videos.length; i++) {
        media_promises.push(upload_media(i, tweets[x].videos[i]));
      }
    }

    Promise.all(media_promises).then(() => {
      var mediaids = [];
      if (Object.keys(medias).length === 0)
        mediaids = null;
      else {
        var keys_sorted = Object.keys(medias).sort();
        keys_sorted.forEach((key) => {
          mediaids.push(medias[key].media_id_string);
        });
      }
      T.post('statuses/update', {
        'status': tweets[x].text,
        'in_reply_to_status_id': tweetid,
        media_ids: mediaids
      }).then(
        (result) => {
          console.log("Tweet " + (x + 1) + "/" + tweets.length);
          do_tweet(x + 1, result.data.id_str);
        },
        (err) => {
          console.log("Error updating status");
          console.log(err);
        }
      );
    });
  };
  do_tweet(0, null);
}

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

function update_reddit(filename) {
  var contents = fs.readFileSync(filename).toString('utf8');
  var splitted = contents.split("\n");

  var fn_split = path.basename(filename).split("_");

  var group_hangul = fn_split[0];
  var groupname = parse_feeds.parse_hangul_first(group_hangul);

  /*var namespace = parse_feeds.feeds_toml.general;
  if (group_hangul in parse_feeds.feeds_toml) {
    namespace = parse_feeds.feeds_toml[group_hangul];
    }*/
  var reddit = parse_feeds.feeds_toml.reddit[group_hangul];
  if (!reddit) {
    console.log("No reddit configured for " + group_hangul);
    return;
  }
  console.log ("/r/" + reddit);

  var namespace = get_settings(group_hangul, "reddit/" + reddit);

  var start = fn_split[1];
  var end = fn_split[2].replace(/[^0-9]*/g, "");

  var timestr = start;

  if (start !== end) {
    var newend = end;

    if (start.substr(0, 2) === end.substr(0, 2))
      newend = end.substr(2);

    if (start.substr(2, 2) === end.substr(2, 2))
      newend = end.substr(4);

    timestr = start + "-" + newend;
  }

  var usernames = {};
  var hasfamily = false;
  var onlyone = true;
  var personcount = 0;
  var instagram_count = 0;
  var twitter_count = 0;
  var weibo_count = 0;
  var lastlink = null;
  var lastinstagram = null;
  var titlelink = null;
  var nextlink = true;

  var newsplitted = [];

  for (var i = 0; i < splitted.length; i++) {
    if (lastlink !== null) {
      newsplitted.push(splitted[i]);
    }

    if (splitted[i].startsWith("*****")) {
      onlyone = false;
      nextlink = true;
      continue;
    }

    if (splitted[i].startsWith("##")) {
      personcount++;
    }

    if (nextlink && splitted[i].startsWith("http")) {
      if (splitted[i].indexOf("images below as an album") >= 0)
        continue;

      lastlink = splitted[i].replace(/ +-.*/, "");
      /*console.log(splitted[i]);
      console.log(splitted[i].replace(/.* +-/, ""));*/
      if (splitted[i].replace(/.* +-/, "").indexOf("title") >= 0)
        titlelink = lastlink;
      if (splitted[i].indexOf("www.instagram.com") >= 0) {
        instagram_count++;
        lastinstagram = lastlink;
      } else if (splitted[i].indexOf("twitter.com") >= 0) {
        twitter_count++;
      } else if (splitted[i].indexOf("weibo.com") >= 0) {
        weibo_count++;
      }

      nextlink = false;
      continue;
    }

    if (!splitted[i].startsWith("##"))
      continue;

    if (splitted[i].match(/\(.*'s/)) {
      // family
      hasfamily = true;
    } else {
      usernames[splitted[i].replace(/.*\((http.*?)\).*/, "$1")] = true;
    }
  }

  if (!onlyone) {
    if (personcount > 1)
      newsplitted = splitted;
    else {
      newsplitted = splitted;
      for (var i = 0; i < newsplitted.length; i++) {
        if (parse_feeds.strip(newsplitted[i]).startsWith("##")) {
          newsplitted[i] = "*****";
          break;
        }
      }
    }
  } else {
    console.log("Only one");
    var i;
    for (i = 0; i < newsplitted.length; i++) {
      if (parse_feeds.strip(newsplitted[i])) {
        break;
      }
    }
    newsplitted = newsplitted.slice(i);
  }

  if (instagram_count < 2 && !titlelink) {
    if (lastinstagram)
      titlelink = lastinstagram;
    else if (onlyone)
      titlelink = lastlink;
  }

  var users = {};
  var forcegroup = false;

  var group_members = find_members_by_group(parse_feeds.members, group_hangul);
  for (var i = 0; i < group_members.length; i++) {
    /*var instagram_username, twitter_username, weibo_username;
    if (group_members[i].instagram_obj)
      instagram_username = get_username_from_rssit_url(group_members[i].instagram_obj.url);
    if (group_members[i].twitter_obj)
      twitter_username = get_username_from_rssit_url(group_members[i].twitter_obj.url);
    if (group_members[i].weibo_obj)
    weibo_username = get_username_from_rssit_url(group_members[i].weibo_obj.url);*/
    var current_links = [];
    group_members[i].accounts.forEach((account) => {
      current_links.push(account.link);
    });

    for (var j = 0; j < current_links.length; j++) {
      if (current_links[j] in usernames) {
        users[parse_name_from_title(group_members[i].title, group_hangul)] = true;

        if (group_members[i].nicks[0].hangul === group_hangul) {
          forcegroup = true;
        }
      }
    }
    /*if (instagram_username in usernames ||
        twitter_username in usernames ||
        weibo_username in usernames)
      users[parse_name_from_title(group_members[i].title, group_hangul)] = true;*/
  }

  var prefix = groupname;

  var group_thresh = 3;
  if (namespace.group_thresh)
    group_thresh = namespace.group_thresh;

  if (Object.keys(users).length <= group_thresh && !forcegroup) {
    var userarr = [];
    for (var user in users) {
      userarr.push(user);
    }
    userarr = userarr.sort(naturalSort);
    prefix = userarr.join(", ");
    if (hasfamily)
      prefix += " + Family";
  }

  var updates;

  if (lastinstagram || twitter_count > 0 || weibo_count > 0) {
    if (onlyone) {
      updates = "Update";
    } else {
      updates = "Updates";
    }
  } else {
    if (onlyone) {
      updates = "Story";
    } else {
      updates = "Stories";
    }
  }

  var site = "";
  if (namespace.sns_nick)
    site = namespace.sns_nick;

  if (instagram_count > 0 &&
      twitter_count === 0 &&
      weibo_count === 0) {
    site = "Instagram";
    if (namespace.instagram_nick)
      site = namespace.instagram_nick;
  } else if (instagram_count === 0 &&
             twitter_count > 0 &&
             weibo_count === 0) {
    site = "Twitter";
    if (namespace.twitter_nick)
      site = namespace.twitter_nick;
  } else if (instagram_count === 0 &&
             twitter_count === 0 &&
             weibo_count > 0) {
    site = "Weibo";
    if (namespace.weibo_nick)
      site = namespace.weibo_nick;
  }

  if (site !== "")
    site = site + " ";

  var format = "%M %S%U [%T]";
  if (namespace.format)
    format = namespace.format;

  var title = format
      .replace(/%M/, prefix)
      .replace(/%m/, prefix.toLowerCase())
      .replace(/%S/, site)
      .replace(/%s/, site.toLowerCase())
      .replace(/%U/, updates)
      .replace(/%u/, updates.toLowerCase())
      .replace(/%T/, timestr)
      .replace(/%%/, "%");

  //var title = prefix + site + updates + " [" + timestr + "]";
  console.log(title);

  //return;

  var key = parse_feeds.feeds_toml.general.encrypt_key;
  var encryptor = require('simple-encryptor')(key);
  var reddit_clientid = namespace.reddit_client_id;
  var reddit_clientsecret = namespace.reddit_client_secret;
  var reddit_username = namespace.reddit_username;
  var reddit_password = encryptor.decrypt(namespace.reddit_password);

  const r = new Snoowrap({
    userAgent: 'pc:khelpers:v0.0.1',
    clientId: reddit_clientid,
    clientSecret: reddit_clientsecret,
    username: reddit_username,
    password: reddit_password
  });

  if (!titlelink) {
    console.log("Need title link");
    return;
  } else {
    console.log(titlelink);
  }

  var subreddit = r.getSubreddit(reddit);
  var submitted = subreddit
      .submitLink({
        title: title,
        url: titlelink
      });
  var replied = submitted.reply(newsplitted.join("\n"));
  try {
    submitted.approve();
  } catch (e) {
    console.log("Failed to approve");
  }

  // doesn't work
  /*var flair = parse_feeds.feeds_toml.flairs[group_hangul];
  if (flair) {
    subreddit.getLinkFlairTemplates().then((templates) => {
      var found = false;
      for (var i = 0; i < templates.length; i++) {
        if (templates[i].flair_text === flair) {
          found = true;
          submitted.selectFlair({flair_template_id: templates[i].flair_template_id});
          break;
        }
      }
      if (!found) {
        console.log("Flair not found:");
        console.dir(templates);
      }
    });
  }*/
}

function update_file_main(filename, splitted) {
  var key = parse_feeds.feeds_toml.general.encrypt_key;
  var encryptor = require('simple-encryptor')(key);
  streamable_username = parse_feeds.feeds_toml.general.streamable_id;
  streamable_password = encryptor.decrypt(parse_feeds.feeds_toml.general.streamable_pass);

  if (parse_feeds.feeds_toml.general.imgur_user) {
    //imgur.setClientId(parse_feeds.feeds_toml.general.imgur_id);
    imgur.setCredentials(parse_feeds.feeds_toml.general.imgur_user,
                         encryptor.decrypt(parse_feeds.feeds_toml.general.imgur_pass),
                         parse_feeds.feeds_toml.general.imgur_id);
  } else {
    imgur.setClientId(parse_feeds.feeds_toml.general.imgur_id);
  }

  /*imgur.getCredits().then((credits) => {
    console.dir(credits);
  });*/
  //imgur.setAPIUrl('https://api.imgur.com/3/');

  /*var contents = fs.readFileSync(filename).toString('utf8');
  var splitted = contents.split("\n");*/
  var extra = {};
  var promises = [];
  for (var i = 0; i < splitted.length; i++) {
    if (!splitted[i].match(/^https?:\/\/[^/.]*\.instagram\.com\//) &&
        !splitted[i].match(/^https?:\/\/([^/.]*\.)?weibo\.com\//) &&
        !splitted[i].match(/^https?:\/\/[^/.]*cdninstagram\.com\//) &&
        !splitted[i].match(/^https?:\/\/instagram\..*\.fbcdn\.net\//) &&
        !splitted[i].match(/^https?:\/\/(?:www\.)?twitter.com\//) &&
        !splitted[i].match(/^https?:\/\/(?:www\.)?weibo.com\//)) {
      continue;
    }

    var origi = i;
    i++;
    var images = {};
    var videos = {};
    var story = "";
    var is_title = "";
    var timestamp = "";

    if (splitted[i-1].match(/ +- *title/)) {
      is_title = "title, ";
    }

    if (splitted[i-1].match(/ \[[0-9]+\] *$/)) {
      timestamp = " [" + splitted[i-1].replace(/.* \[([0-9]+)\] *$/, "$1") + "]";
    }

    if (splitted[i-1].indexOf("://guid.instagram.com") >= 0) {
      story = "story, ";
    } else if ((splitted[i-1].match(/https?:\/\/[^/.]*cdninstagram\.com\//)) ||
               (splitted[i-1].match(/https?:\/\/instagram\..*\.fbcdn\.net\//))) {
      story = "new profile ";
    }

    if (story)
      story = is_title + story;
    else
      timestamp = "";

    for (; i < splitted.length; i++) {
      if (trim_text(splitted[i]).length === 0) {
        break;
      }

      var file = expandHomeDir(splitted[i]);
      if (!fs.existsSync(file)) {
        console.error(file + " does not exist.");
        continue;
      } else {
        var key = i;
        /*console.log(story);
        console.log(key);
        console.log(origi);
        console.log("");*/
        if (story && key === (origi + 1)) {
          key--;
        }
        extra[i] = "";
        if (file.endsWith(".jpg"))
          images[key] = file;
        else if (file.endsWith(".mp4"))
          videos[key] = file;
        else
          console.error("Unknown extension for " + file);
      }
    }

    //console.log(images);
    //console.log(videos);
    //console.log("---");
    //continue;

    ((images, videos, story, is_title, timestamp) => {
      if (images.length === 0 && videos.length === 0) {
        console.log("Need to fetch...");
      } else {
        //var promises = [];
        //var extra = [];

        if (Object.keys(images).length === 1) {
          var key = Object.keys(images)[0];
          //console.log(key);

          promises.push(do_promise(() => {
            //return new Promise(imgur.uploadFile(images[key]);
            var obj = {};
            obj[key] = images[key];
            return upload_images(obj);
          }, (json) => {
            //console.dir(json);
            console.log("Single image");
            console.log(images[key] + " - " + json.data.link);
            extra[key] = json.data.link + " - " + story + "image" + timestamp;
            //console.dir(extra);
          }, (err) => {
            console.log("Error uploading image: " + images[key]);
            console.log("---");
          }));
        } else if (Object.keys(images).length > 1) {
          var key = Object.keys(images)[0];
          for (var y = 1; y < Object.keys(images).length; y++) {
            extra[Object.keys(images)[y]] = "";
          }

          promises.push(do_promise(() => {
            var newimages = [];
            for (var image in images) {
              newimages[image] = images[image];
            }

            return upload_images(newimages);//imgur.uploadAlbum(newimages, "File");
          }, (json) => {
            //console.dir(json);
            console.log("Album");
            var albumurl = "https://imgur.com/a/" + json.data.id;
            console.log(albumurl);
            console.dir(images);
            console.log("---");
            extra[key] = "https://imgur.com/a/" + json.data.id + " - " + story + "images" + timestamp;
          }, (err) => {
            console.log("Error uploading album");
            console.dir(images);
            console.log("---");
          }));
        }

        var x_i = 0;
        for (var x in videos) {
          promises.push(((x, x_i) => {
            return new Promise((resolve, reject) => {
              upload_video(videos[x]).then(
                (data) => {
                  //console.dir(data);
                  var text = "https://streamable.com/" + data.shortcode + " - " + story;
                  if (videos.length > 1)
                    text += "video " + (x_i + 1);
                  else
                    text += "video";
                  text += timestamp;

                  extra[x] = text;

                  console.log("Video " + x_i + "/" + Object.keys(videos).length);
                  resolve();
                },
                (err) => {
                  reject(err);
                }
              );
            });
          })(x, x_i));
          x_i++;
        }
      }
    })(images, videos, story, is_title, timestamp);
  }

  Promise.all(promises).then(() => {
    if (Object.keys(uploaded_images).length <= 1) {
      replace_lines(filename, splitted, extra, null);
      return;
    }

    upload_images(uploaded_images).then(
      (data) => {
        //console.log(data);
        return data;
      },
      (err) => {
        console.error("Error uploading final album");
        console.dir(err);
        return null;
      }
    ).then((album_data) => {
      replace_lines(filename, splitted, extra, album_data);
      return;
      console.log("Replacing " + Object.keys(extra).length + " lines");
      /*if ((i - origi) !== extra.length) {
        console.error("Mismatching orig/mod length: " + (i - origi) + "/" + extra.length);
        }*/

      for (var i in extra) {
        splitted[i] = "\n" + extra[i];
      }

      console.log(filename + "_mod");

      // remove duplicate empty lines
      splitted = splitted.join("\n").split("\n");
      var newsplitted = [];
      var lastline = null;
      splitted.forEach((line) => {
        if (trim_text(line) === "" && lastline === "")
          return;

        newsplitted.push(line);
        lastline = trim_text(line);
      });

      if (errors.length >= 0) {
        console.log("ERRORS:");
        console.dir(errors);
      }

        //newsplitted.unshift(

      var newtext = newsplitted.join("\n");
      fs.writeFileSync(filename + "_mod", newtext);
    });
  });
}

function update_twitter(filename) {
  var contents = fs.readFileSync(filename).toString('utf8');
  var splitted = contents.split("\n");
  return update_twitter_main(filename, splitted);
}

function update_blogger(filename) {
  var contents = fs.readFileSync(filename).toString('utf8');
  var splitted = contents.split("\n");
  return update_blogger_main(filename, splitted);
}

function update_file(filename) {
  var contents = fs.readFileSync(filename).toString('utf8');
  var splitted = contents.split("\n");
  return update_file_main(filename, splitted);

  var newsplitted = [];
  var promises = [];
  for (var i = 0; i < splitted.length; i++) {
    newsplitted.push(splitted[i]);

    if (!splitted[i].match(/^https?:\/\/[^/.]*\.instagram.com\//)) {
      continue;
    }

    var origi = i;
    i++;
    var have_more = false;

    for (; i < splitted.length; i++) {
      if (trim_text(splitted[i]).length === 0) {
        break;
      }

      have_more = true;
      break;
    }

    i--;

    if (!have_more) {
      var url = splitted[origi];
      console.log("Fetching info for " + url);
      ((i) => {
        promises.push(new Promise((resolve, reject) => {
          request(get_instagram_rssit_url(url),
                  (error, response, body) => {
                    // fixme: replace url with local
                    var node = JSON.parse(body);
                    var newarr = [];
                    if (node.node_images.length > 0)
                      newarr.push(node.node_images.join("\n"));
                    if (node.node_videos.length > 0)
                      node.node_videos.forEach((video) => {
                        newarr.push(video.video);
                      });
                    newarr.push("");

                    for (var x = 0; x < newarr.length; x++) {
                      newsplitted.splice(i + x, 0, newarr[x]);
                    }
                    resolve();
                  });
        }));
      })(i + 1);
    }
  }

  Promise.all(promises).then(() => {
    update_file_main(filename, newsplitted);
  });
}

function parse_name_from_title(title, group) {
  var base = parse_feeds.strip(title);
  if (base === parse_feeds.strip(parse_feeds.parse_hangul_first(group)))
    return base;

  return parse_feeds.strip(title
                           .replace(parse_feeds.parse_hangul_first(group), "")
                           .replace(/\( */, "(")
                           .replace(/Ex-/, ""));
}

function do_timestamp(ts) {
  return parse_feeds.pad(ts.year().toString().slice(2), 2) +
    parse_feeds.pad((ts.month() + 1).toString(), 2) +
    parse_feeds.pad((ts.date()).toString(), 2);;
}

function main() {
  if (process.argv.length < 3) {
    console.log("groupname [start_timestamp] [-?end_timestamp] [re|tw]");
    return;
  }


  if (process.argv[2] === "encrypt") {
    parse_feeds.read_toml().then(
      () => {
        var key = parse_feeds.feeds_toml.general.encrypt_key;
        var encryptor = require('simple-encryptor')(key);
        console.log(encryptor.encrypt(process.argv[3]));
      }
    );
    return;
  }

  var basedir = expandHomeDir(parse_feeds.feeds_toml.general.snssavedir);
  var group = process.argv[2];
  var timestamp = process.argv[3];
  if (!timestamp) {
    var last_timestamp = 0;
    var items = fs.readdirSync(basedir);
    items = items.sort(naturalSort);
    items.forEach((item) => {
      if (item.split("_")[0] !== group || item.indexOf(".txt_mod") < 0)
        return;
      var curr = parseInt(item.split("_")[2]);
      if (curr > last_timestamp)
          last_timestamp = curr;
    });
    if (last_timestamp > 0) {
      timestamp = last_timestamp.toString();
      //console.log(timestamp);
      var temp = moment(parse_timestamp(timestamp));
      temp.add(1, 'd');
      /*console.log(temp);
      console.log(temp.date());
      console.log(temp.month());
      console.log(temp.year());*/
      /*console.log(reset_date(temp.toDate()));
      timestamp = parse_feeds.create_timestamp(reset_date(temp.toDate()));
      console.log(timestamp);*/
      /*timestamp =
        parse_feeds.pad(temp.year().toString().slice(2), 2) +
        parse_feeds.pad((temp.month() + 1).toString(), 2) +
        parse_feeds.pad((temp.date()).toString(), 2);*/
      timestamp = do_timestamp(temp);
    }
  }
  if (!timestamp) {
    console.log("No timestamp");
    return;
  }
  var startdate = parse_timestamp(timestamp);

  var enddate;
  var end_timestamp;
  var create = true;
  var tw = false;
  var reddit = false;
  var blogger = false;
  if (process.argv.length >= 5) {
    var enddate_timestamp = process.argv[4];
    if (enddate_timestamp[0] === "-") {
      enddate_timestamp = enddate_timestamp.substr(1);
    } else {
      create = false;
    }
    end_timestamp = enddate_timestamp;
    enddate = parse_timestamp(end_timestamp, true);
    if (process.argv.length === 6) {
      if (process.argv[5] === "tw") {
        console.log("Twitter");
        tw = true;
      } else if (process.argv[5] === "re") {
        console.log("Reddit");
        reddit = true;
      } else if (process.argv[5] === "bl") {
        console.log("Blogger");
        blogger = true;
      } else {
        console.log("Not twitter/reddit/blogger?");
      }
    }
    //create = false;
  } else {
    enddate = new Date();
    enddate = reset_date(null);
    enddate = new Date(enddate - 1);
    end_timestamp = parse_feeds.create_timestamp(enddate);
  }

  if (enddate < startdate) {
    console.log("enddate < startdate");
    return;
  }

  if (enddate > new Date()) {
    console.log("enddate > now");
    return;
  }

  console.log("From " + startdate + " to " + enddate);

  var oneday = false;
  if (timestamp === end_timestamp)
    oneday = true;

  var basename = group + "_" + timestamp + "_" + end_timestamp + ".txt";

  parse_feeds.parse_feeds(true).then(
    (members) => {
      var basedir = expandHomeDir(parse_feeds.feeds_toml.general.snssavedir);
      var filename = path.join(basedir, basename);
      console.log(filename);

      if (tw) {
        if (!fs.existsSync(filename)) {
          console.log(filename + " doesn't exist");
        }
        parse_feeds.db.close();
        update_twitter(filename);
        return;
      } else if (reddit) {
        if (!fs.existsSync(filename + "_mod")) {
          console.log(filename + "_mod doesn't exist");
        }
        parse_feeds.db.close();
        update_reddit(filename + "_mod");
        return;
      } else if (blogger) {
        if (!fs.existsSync(filename + "_mod")) {
          console.log(filename + "_mod doesn't exist");
        }
        parse_feeds.db.close();
        update_blogger(filename + "_mod");
        return;
      }

      if (!create) {
        if (!fs.existsSync(filename)) {
          console.log(filename + " doesn't exist");
        }

        imgur._getAuthorizationHeader().then(() => {
          update_file(filename);
        }, (err) => {
          console.dir(err);
        });

        parse_feeds.db.close();
        return;
      }

      if (fs.existsSync(filename)) {
        if (!readlineSync.keyInYNStrict("Do you wish to replace " + filename + "?")) {
          parse_feeds.db.close();
          return;
        }
      }

      //var feed_urls = get_feed_urls(find_feed(parse_feeds.toplevel_feed, group));
      //console.log(feed_urls);
      var important_instagram_usernames = [];
      var important_twitter_usernames = [];
      var important_weibo_usernames = [];
      for (var i = 0; i < members.length; i++) {
        if (!members[i])
          continue;

        var url;
        //var member_username;

        members[i].accounts.forEach((account) => {
          var title;
          if (members[i].nicks) {
            title = parse_name_from_title(members[i].title, group).toLowerCase();
            link_names[account.link] = title;
          }

          if (account.site === "instagram") {
            important_instagram_usernames.push(account.username);

            if (title)
              instagram_username_names[account.username] = title;
          } else if (account.site === "twitter") {
            important_twitter_usernames.push(account.username);

            if (title)
              twitter_username_names[account.username] = title;
          } else if (account.site === "weibo") {
            //var userid = get_username_from_rssit_url(account.link);
            var userid = account.username;
            var username = account.obj.title;
            //important_weibo_usernames.push(account.username);
            important_weibo_usernames.push(userid);

            if (title) {
              weibo_username_names[userid] = title;
              weibo_username_names[username] = weibo_username_names[userid];
            }

            weibo_userids_to_usernames[userid] = username;
          }
        });

        /*if (members[i].instagram_obj) {
          url = members[i].instagram_obj.url;
          if (url.indexOf("/instagram/") >= 0) {
            member_username = get_username_from_rssit_url(url);
            important_instagram_usernames.push(member_username);

            if (!members[i].nicks)
              continue;

            instagram_username_names[member_username] = parse_name_from_title(members[i].title, group).toLowerCase();
          }
        }

        if (members[i].twitter_obj) {
          url = members[i].twitter_obj.url;
          if (url.indexOf("/twitter/") >= 0) {
            member_username = get_username_from_rssit_url(url);
            important_twitter_usernames.push(member_username);

            if (!members[i].nicks)
              continue;

            twitter_username_names[member_username] = parse_name_from_title(members[i].title, group).toLowerCase();
          }
        }

        if (members[i].weibo_obj) {
          url = members[i].weibo_obj.url;
          if (url.indexOf("/weibo/") >= 0) {
            member_username = members[i].weibo_obj.title;
            var userid = get_username_from_rssit_url(url);
            important_weibo_usernames.push(member_username);

            if (!members[i].nicks)
              continue;

            weibo_username_names[userid] = parse_name_from_title(members[i].title, group).toLowerCase();
            weibo_username_names[member_username] = weibo_username_names[userid];
            weibo_userids_to_usernames[userid] = member_username;
          }
        }*/
      }

      var group_members = find_members_by_group(members, group);
      if (group_members.length === 0) {
        console.log("No group members");
        parse_feeds.db.close();
        return;
      }

      var urls = [];
      for (var i = 0; i < group_members.length; i++) {
        /*if (group_members[i].instagram_obj)
          urls.push(group_members[i].instagram_obj.url);
        if (group_members[i].twitter_obj)
          urls.push(group_members[i].twitter_obj.url);
        if (group_members[i].weibo_obj)
        urls.push(group_members[i].weibo_obj.url);*/
        group_members[i].accounts.forEach((account) => {
          urls.push(account.obj.url);
        });
      }

      var starttime = 9007199254740991;
      var endtime = 0;
      parse_feeds.db_content.find({
        url: {
          $in: urls
        },
        $or: [
          {
            created_at: {
              $gte: startdate.getTime(),
              $lt: enddate.getTime()
            }
          },
          {
            added_at: {
              $gte: startdate.getTime(),
              $lt: enddate.getTime()
            }
          }
        ]
      }, {sort: {created_at: -1}}).then((content) => {
        //console.dir(content);
        parse_feeds.db.close();
        //console.log(content.length);

        if (content.length === 0) {
          console.log("No content");
          return;
        }

        var mcontent = {};
        var newcontent = [];
        for (var i = 0; i < content.length; i++) {
          if ((content[i].created_at < startdate.getTime() ||
               content[i].created_at > enddate.getTime()) &&
              content[i].title.indexOf("[DP] ") < 0) {
            continue;
          }

          if (!(content[i].url in mcontent))
            mcontent[content[i].url] = [];

          newcontent.push(content[i]);
          mcontent[content[i].url].push(content[i]);

          var created = content[i].created_at;
          if (content[i].title.indexOf("[DP] ") >= 0) {
            created = content[i].added_at;
          }

          if (created < starttime) {
            starttime = created;
          }

          if (created > endtime) {
            endtime = created;
          }
        }

        console.log(newcontent.length);

        var inword = false;
        var hanword = false;
        var words = 0;
        var hanwords = 0;
        var chars = 0;
        var hanchars = 0;

        for (var i = 0; i < newcontent.length; i++) {
          var cereal = cheerio.load(newcontent[i].content);
          var text = cheerio(cereal("p")[0]).text();
          for (var j = 0; j < text.length; j++) {
            if (text[j].match(/\s|[\]-~!@#$%^&*()_=`+{}\\|,.<>/?;:'"]/)) {
              if (inword) {
                inword = false;

                if (hanword)
                  hanwords++;
                hanword = false;

                words++;
              }
              continue;
            }

            inword = true;
            chars++;

            if (parse_feeds.is_hangul(text.charCodeAt(j))) {
              hanchars++;
              hanword = true;
            }
          }

          if (inword) {
            words++;
            if (hanword)
              hanwords++;

            inword = false;
            hanword = false;
          }
        }

        console.log(words + "/" + chars + " words/characters (korean: " + hanwords + "/" + hanchars + ")");
        if (!readlineSync.keyInYNStrict("Do you wish to continue?")) {
          return;
        }

        var new_timestamp = do_timestamp(moment(starttime));
        var new_end_timestamp = do_timestamp(moment(endtime));

        if (new_timestamp !== timestamp ||
            new_end_timestamp !== end_timestamp) {
          timestamp = new_timestamp;
          end_timestamp = new_end_timestamp;

          oneday = false;
          if (timestamp === end_timestamp)
            oneday = true;

          basename = group + "_" + timestamp + "_" + end_timestamp + ".txt";
          filename = path.join(basedir, basename);
          console.log(filename);

          if (fs.existsSync(filename)) {
            if (!readlineSync.keyInYNStrict("Do you wish to replace " + filename + "?")) {
              return;
            }
          }
        }

        var mlinks = {};
        var mentries = {};
        var promises = [];
        var promises_done = 0;
        for (var member_url in mcontent) {
          var nick = undefined;
          var subfolder = undefined;
          for (var x = 0; x < group_members.length; x++) {
            group_members[x].accounts.forEach((account) => {
              if (nick)
                return;

              if (account.link === get_home_from_rssit_url(member_url)) {
                nick = link_names[account.link];
              }
            });

            /*if (group_members[x].instagram_obj) {
              if (group_members[x].instagram_obj.url === member_url) {
                //nick = group_members[x].nicks[0].roman_first;
                nick = instagram_username_names[get_username_from_rssit_url(member_url)];
              }
            }

            if (!nick && group_members[x].twitter_obj) {
              if (group_members[x].twitter_obj.url === member_url) {
                nick = twitter_username_names[get_username_from_rssit_url(member_url)];
              }
            }

            if (!nick && group_members[x].weibo_obj) {
              if (group_members[x].weibo_obj.url === member_url) {
                nick = weibo_username_names[get_username_from_rssit_url(member_url)];
              }
            }*/
          }

          if (member_url.indexOf("/instagram/") >= 0)
            subfolder = "instagram";
          else if (member_url.indexOf("/twitter/") >= 0)
            subfolder = "twitter";
          else if (member_url.indexOf("/weibo/") >= 0)
            subfolder = "weibo";

          if (!mentries[nick])
            mentries[nick] = {};
          //mlinks[nick] = "https://www.instagram.com/" + get_username_from_rssit_url(member_url) + "/";
          if (!mlinks[nick])
            mlinks[nick] = [];
          mlinks[nick].push(get_home_from_rssit_url(member_url));
          var mmember = mcontent[member_url];
          var member_username = get_username_from_rssit_url(mmember[0].url);
          var member_userid = member_username;
          if (subfolder === "weibo")
            member_username = weibo_userids_to_usernames[member_userid];
          var folder_username = member_username;
          if (subfolder === "instagram")
            folder_username = member_username.toLowerCase();
          var dl_path = expandHomeDir(path.join(parse_feeds.feeds_toml.general.dldir, subfolder, member_username));
          var items = fs.readdirSync(dl_path);
          items = items.sort(naturalSort);
          for (var x = 0; x < mmember.length; x++) {
            var cereal = cheerio.load(mmember[x].content);
            var text = cheerio(cereal("p")[0]).text();
            var newlines = [];
            var entry = {
              url: mmember[x].link,
              story: false,
              dp: false,
              created: mmember[x].created_at,
              content: null
            };
            var has_nonblank = false;

            if (subfolder === "twitter" &&
                text.match(/https?:\/\/www\.instagram\.com\/p\/[^ ]* *$/))
              continue;

            if (trim_text(text) === "(n/a)") {
              entry.empty = true;
            }

            if (trim_text(text).indexOf("[DP] ") >= 0) {
              console.log(text);
              entry.dp = true;
              entry.created = mmember.added_at;
            }

            if (!mentries[nick][entry.created]) {
              mentries[nick][entry.created] = [];
            }

            text.split("\n").forEach((line) => {
              if (entry.empty || entry.dp)
                return;

              var trimmed_line = trim_text(line);
              if (trimmed_line.startsWith("[STORY]")) {
                entry.story = true;
                line = line.replace(/\[STORY\] */, "");
              } else if (trimmed_line.startsWith("[LIVE]") ||
                         trimmed_line.startsWith("[LIVE REPLAY]")) {
                console.log("Live: " + entry.url + "(" + text + ")");
                entry.live = true;
              }

              line = escape_text(line);

              if (trim_text(line) === "") {
                newlines.push(">-");
              } else {
                newlines.push(quote_text(line));
                //newlines.push(">" + wrap(line, {width: 60, indent:'', newline:'\n>'}));
                has_nonblank = true;
              }
            });

            if (entry.live)
              continue;

            if (has_nonblank) {
              entry.content = newlines.join("\n>\n");
              //console.log(entry.content);
            }

            var entrytext = entry.url;
            if (entry.story) {
              entrytext += " - story";
            } else if (entry.dp) {
              entrytext += " - new profile photo";
            }

            if (!oneday) {
              entrytext += " [" + do_timestamp(moment(entry.created)) + "]";
            }

            entrytext += "\n";

            //entrytext += "*posted at " + moment(entry.created).format("YYYY-MM-DD HH:mm:ss") + "*\n\n";
            //entrytext += get_username_from_rssit_url(mmember[x].url) + ":" + mmember[x].created_at + "\n";

            var igimages = [];
            var igvideos = [];
            cereal("img").each((i, img) => {
              var $this = cheerio(img);
              if (cereal($this.parents("a")).length > 0) {
                igvideos.push(cheerio($this.parents("a")).attr("href").replace(/.*\/\/localhost:[0-9]*\/player\//, "").replace(/\?.*/, ""));
              } else {
                igimages.push($this.attr("src").replace(/\?.*/, ""));
              }
            });

            var starting = "(" + date_to_isotime(mmember[x].created_at);
            if (entry.dp)
              starting += ") " + trim_text(text).substr(0, 50);
            var limages = [];
            var lvideos = [];
            items.forEach((item) => {
              if (item.startsWith(starting)) {
                var end = "";
                var igarr = null;
                var larr = null;
                if (item.endsWith(".jpg")) {
                  igarr = igimages;
                  larr = limages;
                  end = ".jpg";
                } else if (item.endsWith(".mp4")) {
                  igarr = igvideos;
                  larr = lvideos;
                  end = ".mp4";
                } else {
                  console.log("Unknown extension for " + item);
                }

                if (igarr.length > 1) {
                  end = ":" + igarr.length + ")" + end;
                }

                if (!item.endsWith(end))
                  return;

                if (igarr.length === larr.length)
                  return;

                larr.push(path.join(dl_path, item).replace(/^\/home\/[^/]*\//, "~/"));
              }
            });

            if (limages.length > 0) {
              entrytext += limages.join("\n") + "\n";
            }
            if (lvideos.length > 0) {
              entrytext += lvideos.join("\n") + "\n";
            }

            if (limages.length !== igimages.length) {
              console.log("Error: Mismatching images length: " + limages.length + "/" + igimages.length);
              console.log(starting);
              console.dir(limages);
              console.dir(igimages);
            }

            if (lvideos.length !== igvideos.length) {
              console.log("Error: Mismatching videos length: " + lvideos.length + "/" + igvideos.length);
              console.log(starting);
              console.dir(lvideos);
              console.dir(igvideos);
            }

            /*if (cereal("a").length > 0) {
              entrytext += cheerio(cereal("a")[0]).attr("href");
            } else {
              entrytext += cheerio(cereal("img")[0]).attr("src");
            }*/

            //entrytext += "\n";
            if (entry.content) {
              entrytext += "\n" + entry.content + "\n";

              if (parse_feeds.has_hangul(entry.content, false)) {
                entrytext += "\nenglish:\n\n" + entry.content + "\n";
              }
            }

            if (!entry.story && !entry.dp && subfolder === "instagram") {
              promises.push((function(entry, entrytext, mentries, nick) {
                return new Promise((resolve, reject) => {
                  //console.log(get_instagram_rssit_url(entry.url) + "&count=-1")
                  request(get_instagram_rssit_url(entry.url) + "&count=-1",
                          (error, response, body) => {
                            if (response.statusCode === 404) {
                              // deleted post
                              entrytext = entrytext.replace(/^(https?:\/\/[^/]*instagram.*\/p\/.*)$/m, "$1 - deleted");
                              mentries[nick][entry.created].push(entrytext);
                              console.log("Comments: " + (++promises_done) + "/" + promises.length + " (deleted)");
                              resolve();
                              return;
                            } else if (response.statusCode !== 200) {
                              /*entrytext = entrytext.replace(/^(https?:\/\/[^/]*instagram.*\/p\/.*)$/m, "$1");
                              mentries[nick][entry.created].push(entrytext);
                              console.log("Comments: " + (++promises_done) + "/" + promises.length + " (server error)");
                              resolve();
                              return;*/
                              console.log("server error, trying anyways");
                            }

                            /*console.log(entry);
                            console.log(mentries);
                            console.log(nick);*/
                            var node;
                            try {
                              node = JSON.parse(body);
                            } catch (e) {
                              console.log("can't parse JSON");
                              resolve();
                              return;
                            }
                            var comments = node.edge_media_to_comment.edges;
                            var importantcomments = {};

                            function process_comment(comment) {
                              if (comment.created_at in importantcomments)
                                return;

                              importantcomments[comment.created_at] = comment_to_text(comment);

                              var splitted = comment.text.split(" ");
                              splitted.forEach((part) => {
                                if (part[0] === "@") {
                                  do_comments(part.slice(1));
                                }
                              });
                            }

                            function do_comments(user) {
                              for (var j = 0; j < comments.length; j++) {
                                var comment = comments[j].node;
                                if (comment.created_at in importantcomments)
                                  continue;
                                if (important_instagram_usernames.indexOf(comment.owner.username) >= 0) {
                                  process_comment(comment);
                                } else if (user && user === comment.owner.username) {
                                  //importantcomments.push(comment_to_text(comment));
                                  process_comment(comment);
                                }/* else if (important_usernames.indexOf(comment.owner.username) >= 0) {
                                  //importantcomments.push(comment_to_text(comment));
                                  process_comment(comment);
                                }*/
                              }
                            }

                            do_comments();

                            if (Object.keys(importantcomments).length > 0) {
                              entrytext += "\n-\n\n*comments*\n\n";

                              for (var key in importantcomments) {
                                entrytext += importantcomments[key];
                              }

                              //entrytext += "-\n\n";
                            }

                            mentries[nick][entry.created].push(entrytext);
                            console.log("Comments: " + (++promises_done) + "/" + promises.length + " (" + Object.keys(importantcomments).length + "/" + comments.length + "/" + node.edge_media_to_comment.count + ")");
                            resolve();
                          });
                });
              })(entry, entrytext, mentries, nick));
            } else {
              mentries[nick][entry.created].push(entrytext);
            }
          }
        }

        Promise.all(promises).then(() => {
          console.log("Writing...");
          if (mentries.length === 0) {
            console.log("Nothing to do");
            return;
          }

          var sorted_names = Object.keys(mentries).sort();
          var sorted_entries = [];

          sorted_names.forEach((name) => {
            if (mentries[name].length <= 0)
              return;

            var newarr = [];
            Object.keys(mentries[name]).sort().forEach((key) => {
              Array.prototype.push.apply(newarr, mentries[name][key]);
            });

            var iglink;
            var twlink;
            var weilink;
            mlinks[name].forEach((link) => {
              if (link.indexOf("instagram.com/") >= 0)
                iglink = link;
              else if (link.indexOf("twitter.com/") >= 0)
                twlink = link;
              else if (link.indexOf("weibo.com/") >= 0)
                weilink = link;
            });

            var ourlink;
            if (iglink)
              ourlink = iglink;
            else if (twlink)
              ourlink = twlink;
            else if (weilink)
              ourlink = weilink;

            sorted_entries.push("## [" + name.toLowerCase() + "](" + ourlink + ")\n\n" + newarr.join("\n*****\n\n"));
          });
          var sorted_text = sorted_entries.join("\n*****\n\n");


          try {
            fs.mkdirSync(basedir);
          } catch (err) {
            if (err.code != 'EEXIST') {
              throw err;
            }
          }
          fs.writeFileSync(filename, sorted_text);
          console.log("File written");
          var editor = parse_feeds.feeds_toml.general.editor;
          var editorargs = editor.slice(1);
          editorargs.push(filename);
          spawn(editor[0], editorargs, {
            stdio: 'ignore',
            detached: true
          }).unref();
        });
      });
    },
    (data) => {
      console.error(data);
    }
  );
}

parse_feeds.read_toml().then(main);
