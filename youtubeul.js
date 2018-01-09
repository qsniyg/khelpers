'use strict';

var google = require('googleapis');
var google_oauth = require('./google_oauth');
var parse_feeds = require('./parse_feeds');
var fs = require('fs');
const notifier = require('node-notifier');


var scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

/*google_oauth(scopes, function(auth) {
  var service = google.youtube('v3');
  console.log("YES");
  });*/

// https://stackoverflow.com/a/10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function get_videos() {
  return new Promise((resolve, reject) => {
    google_oauth(scopes, function(auth) {
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

function upload_video(options) {
  console.log(options);

  google_oauth(scopes, function(auth) {
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
          tags: options.tags
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
          title: "Live error",
          message: 'Error uploading live: ' + options.title + '\nReason: ' + err
        });
      } else {
        notifier.notify({
          title: "Live uploaded",
          message: 'Live "' + options.title + '" has been uploaded'
        });
      }

      process.exit();
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

function main() {
  if (process.argv.length < 3) {
    console.log("Need filename");
    return;
  }

  var filename = process.argv[2];
  //console.log(filename);

  var matchobj = filename.match(/\/instagram\/([^/]*)\/\(([^)]*)\)/);
  if (!matchobj) {
    console.log("Not matched");
    return;
  }

  var username_str = matchobj[1];
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

      if (member.obj.url.indexOf("/f/instagram/u/" + username_str) >= 0) {
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
          if (member.names && member.names[0])
            name += member.names[0].roman;
          else if (member.nicks && member.nicks[0])
            name += member.nicks[0].roman;
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
        /*get_videos().then((data) => {
          var count = 0;
          for (var i = 0; i < data.length; i++) {
            var dtitle = data[i].snippet.title;
            if (dtitle.startsWith(firsttitle) && dtitle.endsWith(endtitle)) {
              count++;
            }
          }

          if (count > 0) {
            count++;
            title = firsttitle + " " + count + endtitle;
            console.log(title);
          }

          upload_video({
            title,
            description,
            tags: member.tags,
            file: filename
          });
        }, () => {
          upload_video({
            title,
            description,
            tags: member.tags,
            file: filename
          });
        });*/
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
