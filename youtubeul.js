'use strict';

var google = require('googleapis');
var google_oauth = require('./google_oauth');
var parse_feeds = require('./parse_feeds');
var fs = require('fs');
const notifier = require('node-notifier');
var DMClient = require('dailymotion-sdk').client;


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
  if (noupload) {
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

  google_oauth("youtube", scopes, function(auth) {
    // https://github.com/google/google-api-nodejs-client/blob/master/samples/youtube/upload.js
    var youtube = google.youtube({
      version: 'v3',
      auth
    });

    var req = youtube.videos.insert({
      part: 'id,snippet,status',
      notifySubscribers: false,
      resource: {
        snippet: {
          title: options.title,
          description: options.description,
          tags: options.tags,
          defaultAudioLanguage: "ko-KR"
        },
        status: {
          privacyStatus: 'private'
        }
      },
      media: {
        body: fs.createReadStream(options.file)
      }
    }, function (err, data) {
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
  });
}

function upload_video(options) {
  upload_video_yt(options);
}

function create_timestamp(date) {
  var timestamp_year = pad(date.getFullYear()-2000, 2);
  var timestamp_month = pad(date.getMonth() + 1, 2);
  var timestamp_day = pad(date.getDate(), 2);
  var timestamp = timestamp_year + timestamp_month + timestamp_day;
  return timestamp;
}

var dmupload = false;
var ytupload = false;
var noupload = false;
function main() {
  if (process.argv.length < 3) {
    console.log("Need filename");
    return;
  }

  //var dmupload = false;
  if (process.argv.length == 4) {
    if (process.argv[3] === "dm") {
      dmupload = true;
    } else if (process.argv[3] === "yt") {
      ytupload = true;
    } else if (process.argv[3] === "no") {
      noupload = true;
    }
  }

  var filename = process.argv[2];
  //console.log(filename);

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
  var endtitle = " [" + timestamp + "]";

  var description = "Instagram: https://www.instagram.com/" + username_str + "/";

  parse_feeds.parse_feeds().then((members) => {
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member)
        continue;

      if (member.obj.url.indexOf("/f/instagram/u/" + username_str.toLowerCase()) >= 0) {
        console.log(member);

        var name = "";
        if (member.group) {
          if (member.ex) {
            name = "Ex-";
          }

          name += parse_feeds.parse_hangul_first(member.group) + " ";

          if (member.nicks && member.nicks[0])
            name += member.nicks[0].roman;
          else if (member.names && member.names[0])
            name += member.names[0].roman;
          else
            name += member.alt;
        } else {
          if (member.nicks && member.nicks[0] && member.has_user_nick)
            name += member.nicks[0].roman;
          else if (member.names && member.names[0])
            name += member.names[0].roman;
          else
            name += member.alt;
        }

        if (member.names && member.names[0])
          name += " (" + member.names[0].hangul + ")";

        var firsttitle = name + " Instagram Live";
        var title = firsttitle + endtitle;
        console.log(title);

        console.log(description);

        member.tags.push(username_str);

        do_upload({
          firsttitle: firsttitle,
          endtitle: endtitle,
          description: description,
          tags: member.tags,
          file: filename
        });
        return;
      }
    }

    do_upload({
      firsttitle: "@" + username_str + " Instagram Live",
      endtitle,
      description,
      file: filename,
      tags: [username_str]
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
      console.log(options.title);
    }

    if (dmupload) {
      upload_video_dm({
        title: options.title,
        description: options.description,
        tags: options.tags,
        file: options.file
      });
      return;
    }
    upload_video({
      title: options.title,
      description: options.description,
      tags: options.tags,
      file: options.file
    });
  }, () => {
    upload_video({
      title: options.title,
      description: options.description,
      tags: options.tags,
      file: options.file
    });
  });
}

main();
