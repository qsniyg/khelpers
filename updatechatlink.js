'use strict';

var google = require('googleapis');
var google_oauth = require('./google_oauth');

var scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/blogger'
];

function main() {
  if (process.argv.length < 3) {
    console.log("Need youtube chat URL");
    return;
  }

  var newlink = process.argv[2];
  if (!newlink.match(/^https?:\/\/youtu\.be\/addme/)) {
    console.log("Not a youtube chat URL");
    return;
  }

  google_oauth("youtube", scopes, function(auth) {
    var youtube = google.youtube({
      version: 'v3',
      auth
    });

    youtube.channels.list({
      part: 'id,snippet,localizations',
      mine: true
    }, function (err, data) {
      if (err) {
        console.log("Error: ", err);
        return;
      }

      console.log(data.items[0]);
      //return;

      var endesc = data.items[0].localizations.en.description;
      var krdesc = data.items[0].localizations.ko.description;


      var regex = /https?:\/\/youtu\.be\/addme\/[-A-Za-z0-9_/]*/;
      endesc = endesc.replace(regex, newlink);
      krdesc = krdesc.replace(regex, newlink);

      console.log(endesc);
      console.log(krdesc);
      //return;

      var locals = data.items[0].localizations;
      locals.en.description = endesc;
      locals.ko.description = krdesc;

      var baserequest = {
        part: 'id,localizations',
        resource: {
          id: data.items[0].id,
          /*localizations: {
            en: {
              description: endesc
            },
            ko: {
              description: krdesc
            }
            }*/
          localizations: locals
        }
      };

      console.log(baserequest);

      //return;
      youtube.channels.update(baserequest, function (err, data) {
        if (err) {
          console.log("Error updating: ", err);
          return;
        }

        console.log(data);
      });
    });
  });
}

main();
