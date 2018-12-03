'use strict';

var google = require('googleapis');
var google_oauth = require('./google_oauth');
var parse_feeds = require('./parse_feeds');
var fs = require('fs');
const notifier = require('node-notifier');
var DMClient = require('dailymotion-sdk').client;
var moment = require('moment-timezone');
var path = require('path');
var mustache = require('mustache');
mustache.escape = function(text) {return text;};
var readlineSync = require('readline-sync');

var tz_offset = 9; // KST
var tz_name = "Asia/Seoul";
moment.tz.setDefault(tz_name);


var scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/blogger'
];

// https://stackoverflow.com/a/10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function get_videos() {
  return new Promise((resolve, reject) => {
    google_oauth("youtube", scopes, function(auth) {
      var youtube = google.youtube({
        version: 'v3',
        auth
      });

      var req = youtube.channels.list({
        part: 'contentDetails',
        mine: true,
        maxResults: 20
      }, function (err, data) {
        if (err) {
          console.error('Error: ' + err);
          reject();
        } else {
          req = youtube.playlistItems.list({
            part: 'snippet,contentDetails',
            maxResults: 50,
            playlistId: data.items[0].contentDetails.relatedPlaylists.uploads
          }, function (err, data) {
            if (err) {
              console.error('Error: ' + err);
              reject();
            } else {
              resolve(data.items);
            }
          });
        }
      });
    });
  });
}

function upload_video_dm(options) {
  // disable dailymotion for now
  if (noupload || (true && !dmupload)) {
    console.dir(options);
    process.exit();
    return;
  }

  var client = new DMClient(
    parse_feeds.feeds_toml.general.dailymotion_id,
    parse_feeds.feeds_toml.general.dailymotion_secret,
    ["manage_videos"]
  );

  var key = parse_feeds.feeds_toml.general.encrypt_key;
  var encryptor = require('simple-encryptor')(key);
  var dm_username = parse_feeds.feeds_toml.general.dailymotion_user;
  var dm_password = encryptor.decrypt(parse_feeds.feeds_toml.general.dailymotion_pass);

  client.setCredentials(DMClient.GRANT_TYPES.PASSWORD, {
    username: dm_username,
    password: dm_password
  });

  client.createToken(() => {
    var retval = client.upload({
      filepath: options.file,
      meta: {
        title: options.title,
        description: options.description,
        tags: options.tags,
        channel: parse_feeds.feeds_toml.general.dailymotion_channel
      },
      progress: (e, r, d) => {
        if (d && d.progress) {
          console.log(d.progress);
        }
      },
      done: (err) => {
        if (err) {
          console.dir(err);
          notifier.notify({
            title: "[DM] Live error",
            message: 'Error uploading live: ' + options.title + ' to dailymotion\nReason: ' + err.message
          });
        } else {
          notifier.notify({
            title: "[DM] Live uploaded",
            message: 'Live "' + options.title + '" has been uploaded to dailymotion'
          });
        }

        process.exit();
      }
    });
    console.dir(retval);
  });
}

function upload_video_yt(options) {
  console.dir(options);

  if (noupload) {
    process.exit();
    return;
  }

  if (!options.privacy ||
      (options.privacy !== "public" &&
       options.privacy !== "unlisted")) {
    options.privacy = "private";
  }

  google_oauth("youtube", scopes, function(auth) {
    // https://github.com/google/google-api-nodejs-client/blob/master/samples/youtube/upload.js
    var youtube = google.youtube({
      version: 'v3',
      auth
    });

    var base_request = {
      part: 'id,snippet,status,localizations',
      notifySubscribers: false,
      resource: {
        snippet: {
          title: options.title,
          description: options.description,
          tags: options.tags,
          defaultLanguage: "en",
          defaultAudioLanguage: "ko"
        },
        status: {
          privacyStatus: options.privacy
        },
        localizations: {
          "en": {
            title: options.title,
            description: options.description
          },
          "ko": {
            title: options.title_korean,
            description: options.description_kr
          }
        }
      }
    };

    var req;
    if (options.youtube_id) {
      base_request.resource.id = options.youtube_id;

      youtube.videos.list({
        id: options.youtube_id,
        part: 'id,snippet,status,localizations'
      }, function(err, data) {
        var result = data.items[0];

        console.dir(result);

        if (reupload) {
          var new_object = {
            title: result.snippet.title,
            title_korean: result.localizations["ko"].title,
            description: result.snippet.description,
            description_kr: result.localizations["ko"].description,
            tags: result.snippet.tags,
            file: options.filename,
            privacy: "private",
            youtube_id: null
          };

          console.dir(new_object);
          if (!readlineSync.keyInYNStrict("Delete video on youtube")) {
            process.exit();
            return;
          }

          upload_video_yt(new_object);

          return;
        }

        var number = result.snippet.title.replace(/.* ([0-9]+) \[[0-9]+\][^a-zA-Z0-9]*$/, "$1");
        console.log(number);
        if (number !== result.snippet.title) {
          base_request.resource.snippet.title = base_request.resource.snippet.title
            .replace(/(?: [0-9]+)? (\[[0-9]+\] *)$/, " " + number + " $1");
          base_request.resource.localizations["ko"].title = base_request.resource.localizations["ko"].title
            .replace(/(?: [0-9]+)?$/, " " + number);
        } else {
          base_request.resource.snippet.title = base_request.resource.snippet.title
            .replace(/ [0-9]+ (\[[0-9]+\] *)$/, " $1");
          base_request.resource.localizations["ko"].title = base_request.resource.localizations["ko"].title
            .replace(/ [0-9]+$/, "");
        }

        for (var item in result.snippet) {
          if (!(item in base_request.resource.snippet))
            base_request.resource.snippet[item] = result.snippet[item];
        }

        base_request.resource.status = result.status;

        console.dir(base_request);

        req = youtube.videos.update(base_request, function (err, data) {
          if (err) {
            console.error('Error: ' + err);
          } else {
            console.log("Updated");
          }

          process.exit();
        });
      });
    } else {
      base_request.media = {
        body: fs.createReadStream(options.file)
      };

      /*base_request.headers = {
        Slug: path.basename(options.file)
      }*/

      req = youtube.videos.insert(base_request, function (err, data) {
        if (err) {
          console.error('Error: ' + err);

          notifier.notify({
            title: "[YT] Live error",
            message: 'Error uploading live: ' + options.title + ' to youtube\nReason: ' + err
          });
        } else {
          notifier.notify({
            title: "[YT] Live uploaded",
            message: 'Live "' + options.title + '" has been uploaded to youtube'
          });
        }

        //process.exit();
        if (ytupload)
          process.exit();
        upload_video_dm(options);
      });

      var fileSize = fs.statSync(options.file).size;

      // show some progress
      var id = setInterval(function () {
        var uploadedBytes = req.req.connection._bytesDispatched;
        var uploadedMBytes = uploadedBytes / 1000000;
        var progress = uploadedBytes > fileSize
            ? 100 : (uploadedBytes / fileSize) * 100;
        /*process.stdout.clearLine();
          process.stdout.cursorTo(0);*/
        /*process.stdout.write*/console.log(uploadedMBytes.toFixed(2) + ' MBs uploaded. ' +
                                            progress.toFixed(2) + '% completed.');
        if (progress === 100) {
          /*process.stdout.write*/console.log('\nDone uploading, waiting for response...\n');
          clearInterval(id);
        }
      }, 1000);
    }
  });
}

function upload_video(options) {
  try {
    upload_video_yt(options);
  } catch (err) {
    notifier.notify({
      title: "[YT] Live error",
      message: 'Error uploading live: ' + options.title + ' to youtube\nProgram error: ' + err
    });
  }
}

function do_timestamp(ts) {
  return parse_feeds.pad(ts.year().toString().slice(2), 2) +
    parse_feeds.pad((ts.month() + 1).toString(), 2) +
    parse_feeds.pad((ts.date()).toString(), 2);
}

function create_timestamp(date) {
  return do_timestamp(moment(date));

  var timestamp_year = pad(date.getFullYear()-2000, 2);
  var timestamp_month = pad(date.getMonth() + 1, 2);
  var timestamp_day = pad(date.getDate(), 2);
  var timestamp = timestamp_year + timestamp_month + timestamp_day;
  return timestamp;
}

var dmupload = false;
var ytupload = false;
var noupload = false;
var reupload = false;
var youtubeid = null;
var desc_prepend = "";
var desc_prepend_kr = "";
function main() {
  var argv = [];
  for (var i = 0; i < process.argv.length; i++) {
    argv.push(process.argv[i]);
  }

  if (argv.length < 3) {
    console.log("Need filename");
    return;
  }

  var filename = process.argv[2];
  //console.log(filename);
  var real_filename = filename;

  //var dmupload = false;
  if (argv.length >= 4) {
    for (var i = 3; i < argv.length; i++) {
      if (argv[i] === "dm") {
        dmupload = true;
      } else if (argv[i] === "yt") {
        ytupload = true;
      } else if (argv[i] === "no") {
        noupload = true;
      } else if (argv[i].match(/^https?:\/\/(?:www.)?youtube\.com/)) {
        youtubeid = argv[i].replace(/.*\/.*?[?&](?:v|video_id)=([^&]*).*?$/, "$1");
      } else if (argv[i].indexOf("prepend=") === 0) {
        desc_prepend = argv[i].replace(/^[^=]*=/, "") + "\n\n";
      } else if (argv[i].indexOf("prepend_kr=") === 0) {
        desc_prepend_kr = argv[i].replace(/^[^=]*=/, "") + "\n\n";
      } else if (argv[i].indexOf("real=") === 0) {
        real_filename = argv[i].replace(/^[^=]*=/, "");
      } else if (argv[i] === "reup") {
        reupload = true;
      }
    }
  }

  if (desc_prepend && !desc_prepend_kr)
    desc_prepend_kr = desc_prepend;

  if (reupload) {
    upload_video_yt({
      filename: real_filename,
      youtube_id: youtubeid
    });
    return;
  }

  var matchobj = filename.match(/\/instagram\/([^/]*)\/\(([^)]*)\)/);
  if (!matchobj) {
    console.log("Not matched");
    return;
  }

  var username_str = matchobj[1].toLowerCase();
  var date_str = matchobj[2];
  var date = new Date(date_str);

  var timestamp_year = pad(date.getFullYear()-2000, 2);
  var timestamp_month = pad(date.getMonth() + 1, 2);
  var timestamp_day = pad(date.getDate(), 2);
  var timestamp = timestamp_year + timestamp_month + timestamp_day;
  timestamp = create_timestamp(date);
  var endtitle = " [" + timestamp + "]";

  var description = desc_prepend + "Instagram: https://www.instagram.com/" + username_str + "/";

  parse_feeds.parse_feeds().then((members) => {
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member)
        continue;

      var member_url;
      var member_usernames = [];

      /*if (member.instagram_obj)
        member_url = member.instagram_obj.url;
      else if (member.obj)
      member_url = member.obj.url;*/
      member.accounts.forEach((account) => {
        member_usernames.push(account.username.toLowerCase());
      });

      //if (member_url.toLowerCase().indexOf("/f/instagram/u/" + username_str.toLowerCase()) >= 0) {
      if (member_usernames.indexOf(username_str.toLowerCase()) >= 0) {
        console.log(member);

        var info = {
          member: member,

          sitename_en: "Instagram",
          sitename_kr: "인스타그램",

          member_url: "https://www.instagram.com/" + username_str + "/"
        };

        var description_template = parse_feeds.feeds_toml.general.description_template;
        if (!description_template) {
          description_template = "{{sitename_en}}: {{member_url}}";
        }

        var description_template_kr = parse_feeds.feeds_toml.general.description_template_kr;
        if (!description_template_kr) {
          description_template = "{{sitename_kr}}: {{member_url}}";
        }

        var description_en = desc_prepend + mustache.render(description_template, info);
        var description_kr = desc_prepend_kr + mustache.render(description_template_kr, info);

        var name = "";
        var member_name = "";
        if (member.group && !member.family && !member.hide_group) {
          if (member.ex && !member.haitus) {
            name = "Ex-";
          }

          var grouphangul = member.group_roman;

          if (member.group_noupload) {
            grouphangul += " NOUPLOAD";
          }

          if (member.nicks_roman_first && !member.use_fullname)
            member_name = member.nicks_roman_first;
          else if (member.names_roman_first)
            member_name = member.names_roman_first;
          else
            member_name = member.alt;

          if (member_name !== grouphangul)
            name += grouphangul + " " + member_name;
          else
            name += grouphangul;
        } else {
          if (member.nicks_roman_first &&
              (member.has_user_nick || !(member.names_roman_first)))
            member_name += member.nicks_roman_first;
          else if (member.names_roman_first)
            member_name += member.names_roman_first;
          else
            member_name += member.alt;

          name = member_name;
        }

        if (member.eng_kr_name)
          name += " (" + member.eng_kr_name + ")";
        else if (member.names && member.names[0] && member.names[0].hangul !== member_name)
          name += " (" + member.names[0].hangul + ")";
        else if (member.nicks && member.nicks[0] && member.nicks[0].hangul !== member_name)
          name += " (" + member.nicks[0].hangul + ")";


        var korean_name = "";
        var korean_member_name = "";
        if (member.group && !member.family && !member.hide_group) {
          var kr_ex = "";
          var kr_ex1 = "";
          if (member.ex && !member.haitus) {
            kr_ex = "前멤버 ";
            kr_ex1 = "前 ";
          }

          var korean_group = member.group;

          if (member.group_noupload) {
            korean_group += " NOUPLOAD";
          }

          if (member.nicks && !member.use_fullname) {
            if (member.nicks_hangul_first)
              korean_member_name = member.nicks_hangul_first;
            else if (member.nicks_roman_first)
              korean_member_name = member.nicks_roman_first;
          }

          if (!korean_member_name) {
            if (member.names && member.names_hangul_first)
              korean_member_name = member.names_hangul_first;
            else
              korean_member_name = member.alt;
          }

          if (korean_member_name !== korean_group)
            //korean_name += korean_group + " " + kr_ex + korean_member_name;
            korean_name += kr_ex1 + korean_group + " " + korean_member_name;
          else
            korean_name += korean_group;
        } else {
          if (member.nicks && (member.nicks_hangul_first || member.nicks_roman_first) &&
              (member.has_user_nick || !(member.names_roman_first))) {
            korean_member_name += member.nicks_hangul_first || member.nicks_roman_first;
          } else if (member.names && member.names_hangul_first) {
            korean_member_name += member.names_hangul_first;
          } else {
            korean_member_name += member.alt;
          }

          korean_name = korean_member_name;
        }

        if (member.names && member.names[0] && member.names[0].hangul !== korean_member_name)
          korean_name += " (" + member.names[0].hangul + ")";
        else if (member.nicks && member.nicks[0] && member.nicks[0].hangul !== korean_member_name &&
                 member.has_user_nick)
          korean_name += " (" + member.nicks[0].hangul + ")";

        var firsttitle = name + " Instagram Live";
        var firsttitle_korean = korean_name + " 인스타라이브";

        if (member.noupload) {
          firsttitle += " NOUPLOAD";
          firsttitle_korean += " NOUPLOAD";
        }

        var title = firsttitle + endtitle;
        var title_korean = firsttitle_korean + endtitle;
        console.log(title);
        console.log(title_korean);

        console.log(description_en);
        console.log(description_kr);

        member.tags.push(username_str);

        var privacy = "private";
        if (member.upload_privacy &&
            (member.upload_privacy === "unlisted" ||
             member.upload_privacy === "public")) {
          privacy = member.upload_privacy;
        }

        do_upload({
          firsttitle: firsttitle,
          firsttitle_korean: firsttitle_korean,
          endtitle: endtitle,
          timestamp: timestamp,
          description: description_en,
          description_kr: description_kr,
          tags: member.tags,
          file: real_filename,
          privacy: privacy,
          youtube_id: youtubeid
        });
        return;
      }
    }

    do_upload({
      firsttitle: "@" + username_str + " Instagram Live",
      firsttitle_korean: "@" + username_str + " 인스타라이브",
      endtitle,
      timestamp,
      description: description,
      description_kr: description,
      file: real_filename,
      tags: [username_str],
      youtube_id: youtubeid
    });
  }).catch((e) => {
    console.error(e);
  });
}

function do_upload(options) {
  if (!("tags" in options)) {
    options.tags = [];
  }

  options.title = options.firsttitle + options.endtitle;
  options.title_korean = options.timestamp + " " + options.firsttitle_korean;

  get_videos().then((data) => {
    var count = 0;
    for (var i = 0; i < data.length; i++) {
      var dtitle = data[i].snippet.title;
      if (dtitle.startsWith(options.firsttitle) && dtitle.endsWith(options.endtitle)) {
        count++;
      }
    }

    if (count > 0) {
      count++;
      options.title = options.firsttitle + " " + count + options.endtitle;
      options.title_korean = options.timestamp + " " + options.firsttitle_korean + " " + count;
      console.log(options.title);
    }

    if (dmupload) {
      upload_video_dm({
        title: options.title,
        title_korean: options.title_korean,
        description: options.description,
        description_kr: options.description_kr,
        tags: options.tags,
        file: options.file,
        privacy: options.privacy
      });
      return;
    }
    upload_video({
      title: options.title,
      title_korean: options.title_korean,
      description: options.description,
      description_kr: options.description_kr,
      tags: options.tags,
      file: options.file,
      privacy: options.privacy,
      youtube_id: options.youtube_id
    });
  }, () => {
    upload_video({
      title: options.title,
      title_korean: options.title_korean,
      description: options.description,
      description_kr: options.description_kr,
      tags: options.tags,
      file: options.file,
      privacy: options.privacy,
      youtube_id: options.youtube_id
    });
  });
}

main();
