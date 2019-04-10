'use strict';

var google = require('googleapis');
var google_oauth = require('./google_oauth');
//var parse_feeds = require('./parse_feeds');
var parse_feeds = null;
var fs = require('fs');
const notifier = require('node-notifier');
var DMClient = require('dailymotion-sdk').client;
var moment = require('moment-timezone');
var path = require('path');
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

function add_to_playlist(youtube, playlist, video, cb) {
  youtube.playlistItems.insert({
    part: "snippet",
    resource: {
      snippet: {
        playlistId: playlist,
        resourceId: {
          kind: "youtube#video",
          videoId: video,
        }
      }
    }
  }, cb);
}

function notify_fatal(message) {
  if (!the_filename)
    the_filename = "";
  notifier.notify({
    title: "[YTUL] Fatal " + the_filename,
    message
  });
  process.exit();
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
        if (err) {
          console.log(err);
        }

        var result = data.items[0];

        console.dir(result);

        if (reupload) {
          var new_object = {
            title: result.snippet.title,
            title_korean: result.localizations.ko.title,
            description: result.snippet.description,
            description_kr: result.localizations.ko.description,
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
          base_request.resource.localizations.ko.title = base_request.resource.localizations.ko.title
            .replace(/(?: [0-9]+)?$/, " " + number);
        } else {
          base_request.resource.snippet.title = base_request.resource.snippet.title
            .replace(/ [0-9]+ (\[[0-9]+\] *)$/, " $1");
          base_request.resource.localizations.ko.title = base_request.resource.localizations.ko.title
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


        var endcb = function() {
          //process.exit();
          if (ytupload)
            process.exit();
          upload_video_dm(options);
        };

        if (options.yt_playlist)
          add_to_playlist(youtube, options.yt_playlist, data.id, endcb);
        else
          endcb();
      });

      var fileSize = fs.statSync(options.file).size;

      // show some progress
      var id = setInterval(function () {
        var uploadedBytes = req.req.connection._bytesDispatched;
        var uploadedMBytes = uploadedBytes / 1000000;
        var progress = uploadedBytes > fileSize ?
            100 : (uploadedBytes / fileSize) * 100;
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

function base_variable(name, top) {
  for (var v in top) {
    if (name === v)
      return top[v];
  }

  if (name.indexOf(".") < 0)
    return null;

  try {
    var split = name.split(".");

    if (split[0] in top) {
      return top[split[0]][split[1]];
    } else {
      return parse_feeds.feeds_toml[split[0]][split[1]];
    }
  } catch (e) {
    console.log(e);
    notify_fatal("Template Variable (" + name + "): " + e);
  }
}

function do_timestamp(ts) {
  return parse_feeds.pad(ts.year().toString().slice(2), 2) +
    parse_feeds.pad((ts.month() + 1).toString(), 2) +
    parse_feeds.pad((ts.date()).toString(), 2);
}

function create_timestamp(date) {
  return do_timestamp(moment(date));
}

var dmupload = false;
var ytupload = false;
var noupload = false;
var reupload = false;
var youtubeid = null;
var desc_prepend = "";
var the_filename = null;
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
  the_filename = real_filename;
  var yt_playlist = null;

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
      } else if (argv[i].indexOf("playlist=") === 0) {
        yt_playlist = argv[i].replace(/^[^=]*=/, "");
      } else if (argv[i] === "reup") {
        reupload = true;
      }
    }
  }

  if (desc_prepend && !desc_prepend_kr)
    desc_prepend_kr = desc_prepend;

  if (reupload) {
    parse_feeds = require('./parse_feeds');
    upload_video_yt({
      filename: real_filename,
      youtube_id: youtubeid
    });
    return;
  }

  var matchobj = filename.match(/\/(instagram|periscope)\/([^/]*)\/\(([^)]*)\)/);
  if (!matchobj) {
    console.log("Not matched");
    return;
  }

  var filename_dirname = path.dirname(filename);
  var filename_basename = path.basename(filename).replace(/(?: REPLAY.)?\.[^/.]*$/, "");
  var filesindir = [];
  var coauthors = [];
  var temp_coauthors = {};
  try {
    filesindir = fs.readdirSync(filename_dirname);
  } catch (e) {
  }

  filesindir.forEach((newfilename) => {
    if (!newfilename.startsWith(filename_basename)) {
      return;
    }

    if (newfilename.indexOf(".coauthor.") >= 0) {
      var coauthor = newfilename.replace(/.*?\.coauthor\./, "");
      if (coauthor !== newfilename) {
        var birth = 0;
        try {
          var stat = fs.statSync(filename_dirname + "/" + newfilename);
          birth = parseInt(stat.birthtimeMs);
        } catch (e) {
        }

        //coauthors.push(coauthor.toLowerCase());
        if (!(birth in temp_coauthors)) {
          temp_coauthors[birth] = [];
        }

        temp_coauthors[birth].push(coauthor.toLowerCase());
      }
    }
  });

  Object.keys(temp_coauthors).sort().forEach((coauthor_birth) => {
    temp_coauthors[coauthor_birth].forEach((coauthor) => {
      coauthors.push(coauthor);
    });
  });

  parse_feeds = require('./parse_feeds');

  var site_str = matchobj[1];
  var username_str = matchobj[2].toLowerCase();
  var date_str = matchobj[3];
  var date = new Date(date_str);

  var timestamp_year = pad(date.getFullYear()-2000, 2);
  var timestamp_month = pad(date.getMonth() + 1, 2);
  var timestamp_day = pad(date.getDate(), 2);
  var timestamp = timestamp_year + timestamp_month + timestamp_day;
  timestamp = create_timestamp(date);
  var endtitle, endtitle_kr,
      firsttitle, firsttitle_kr,
      description, description_kr;

  //var description = desc_prepend + "Instagram: https://www.instagram.com/" + username_str + "/";

  parse_feeds.parse_feeds().then((members) => {
    function resolve_time(name) {
      return base_variable(name, {
        time: timestamp
      });
    }

    function resolve_username(name) {
      return base_variable(name, {
        username: username_str,
        site: parse_feeds.feeds_toml[site_str],
        c: coauthors
      });
    }

    try {
      firsttitle = parse_feeds.template_parse(parse_feeds.feeds_toml.general.basic_title_template, resolve_username);
      firsttitle_kr = parse_feeds.template_parse(parse_feeds.feeds_toml.general.basic_title_template_kr, resolve_username);
      description = desc_prepend + parse_feeds.template_parse(parse_feeds.feeds_toml.general.basic_description_template, resolve_username);
      description_kr = desc_prepend_kr + parse_feeds.template_parse(parse_feeds.feeds_toml.general.basic_description_template_kr, resolve_username);
      endtitle = parse_feeds.template_parse(parse_feeds.feeds_toml.general.timestamp_template, resolve_time);
      endtitle_kr = parse_feeds.template_parse(parse_feeds.feeds_toml.general.timestamp_template_kr, resolve_time);
    } catch (e) {
      console.log(e);
      notify_fatal("Template error: " + e);
    }

    var found_accounts = {};
    var found = false;
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (!member)
        continue;

      var member_url;
      var member_usernames = [];
      var member_accounts = [];

      /*if (member.instagram_obj)
        member_url = member.instagram_obj.url;
      else if (member.obj)
      member_url = member.obj.url;*/
      member.accounts.forEach(account => {
        if (account.username && account.site == site_str) {
          member_usernames.push(account.username.toLowerCase());
          member_accounts.push(account);
        }
      });

      //if (member_url.toLowerCase().indexOf("/f/instagram/u/" + username_str.toLowerCase()) >= 0) {
      var can_add = false;
      var add_username = null;
      var member_username_index = member_usernames.indexOf(username_str);
      if (member_username_index >= 0) {
        found = true;
        can_add = true;
        add_username = username_str;
      } else {
        for (var j = 0; j < coauthors.length; j++) {
          member_username_index = member_usernames.indexOf(coauthors[j]);
          if (member_username_index >= 0) {
            can_add = true;
            add_username = coauthors[j];
            break;
          }
        }
      }

      if (can_add) {
        found_accounts[add_username] = {
          member: member,
          account: member_accounts[member_username_index]
        };
      }
    }

    if (!found) {
      do_upload({
        firsttitle,
        firsttitle_korean: firsttitle_kr,
        endtitle,
        endtitle_kr,
        timestamp,
        description: description,
        description_kr: description_kr,
        file: real_filename,
        tags: [username_str],
        youtube_id: youtubeid,
        yt_playlist: yt_playlist
      });
    } else {
      var found_account = found_accounts[username_str];
      var member = found_account.member;
      console.log(member);
      var account = found_account.account;

      var coauthor_members = [];
      coauthors.forEach((coauthor) => {
        var found_coauthor = found_accounts[coauthor];
        if (!found_coauthor || !found_coauthor.member || !found_coauthor.account ||
            !found_coauthor.member.title || found_coauthor.member.title[0] == "@") {
          console.log("Skipping coauthor: @" + coauthor);
          return;
        }

        var group = found_coauthor.member.group;
        var coauthor_title = found_coauthor.member.title;
        var coauthor_title_kr = found_coauthor.member.title_kr;
        if (group && group === member.group) {
          coauthor_title = found_coauthor.member.member_name;
          coauthor_title_kr = found_coauthor.member.member_name_kr;
        }
        coauthor_members.push({
          m: found_coauthor.member,
          a: found_coauthor.account,
          t: coauthor_title,
          tk: coauthor_title_kr
        });
      });

      function resolve_variable(name) {
        return base_variable(name, {
          m: member,
          a: account,
          cm: coauthor_members,
          c: coauthors,
          site: parse_feeds.feeds_toml[account.site]
        });
      }

      var new_firsttitle, new_firsttitle_kr;
      var new_description, new_description_kr;
      try {
        new_firsttitle = parse_feeds.template_parse(parse_feeds.feeds_toml.general.member_title_template, resolve_variable);
        new_firsttitle_kr = parse_feeds.template_parse(parse_feeds.feeds_toml.general.member_title_template_kr, resolve_variable);
        console.log(new_firsttitle);
        console.log(new_firsttitle_kr);

        new_description = desc_prepend + parse_feeds.template_parse(parse_feeds.feeds_toml.general.member_description_template, resolve_variable);
        new_description_kr = desc_prepend_kr + parse_feeds.template_parse(parse_feeds.feeds_toml.general.member_description_template_kr, resolve_variable);
        console.log(new_description);
        console.log(new_description_kr);
      } catch (e) {
        console.log(e);
        notify_fatal("Template error: " + e);
      }

      if ("tags" in parse_feeds.feeds_toml[site_str]) {
        parse_feeds.feeds_toml[site_str].tags.forEach(tag => {
          parse_feeds.upush(member.tags, tag);
        });
      }
      member.tags.push(username_str);

      var privacy = "private";
      if (account.upload_privacy &&
          (account.upload_privacy === "unlisted" ||
           account.upload_privacy === "public")) {
        privacy = account.upload_privacy;
        console.log("Privacy: "+ privacy);
      }

      if (!yt_playlist && member.playlist && member.playlist.length >= 10) {
        yt_playlist = member.playlist;
      }

      do_upload({
        firsttitle: new_firsttitle,
        firsttitle_korean: new_firsttitle_kr,
        endtitle: endtitle,
        endtitle_kr: endtitle_kr,
        timestamp: timestamp,
        description: new_description,
        description_kr: new_description_kr,
        tags: member.tags,
        file: real_filename,
        privacy: privacy,
        youtube_id: youtubeid,
        yt_playlist: yt_playlist
      });
      return;
    }
  }).catch((e) => {
    console.error(e);
  });
}

function do_upload(options) {
  if (!("tags" in options)) {
    options.tags = [];
  }

  options.title = options.firsttitle + options.endtitle;
  options.title_korean = options.endtitle_kr + " " + options.firsttitle_korean;

  if (noupload) {
    console.log(options);
    return;
  }

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
      options.title_korean = options.endtitle_kr + " " + options.firsttitle_korean + " " + count;
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
        privacy: options.privacy,
        yt_playlist: options.yt_playlist
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
      youtube_id: options.youtube_id,
      yt_playlist: options.yt_playlist
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
      youtube_id: options.youtube_id,
      yt_playlist: options.yt_playlist
    });
  });
}

main();
