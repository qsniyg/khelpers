// doesn't seem to work for audio-only videos
var path = require('path');
var url = require('url');
var request = require('request');
var fs = require('fs');

function upload(video) {
  var shortidurl = "https://streamja.com/shortId.php";
  var title = path.parse(video).name;
  var jar = request.jar();
  var request_binks = request.defaults({jar: jar});
  return new Promise((resolve, reject) => {
    request_binks.post({
      url: shortidurl,
      form: {
        "new": 1
      }
    }, (error, response, data) => {
      if (error) {
        console.log("ERROR");
        console.dir(error);
      }
      console.log(data);

      var json = JSON.parse(data);
      request_binks.post({
        url: url.resolve(shortidurl, json.uploadUrl),
        formData: {
          "file": fs.createReadStream(video)
        }
      }, (error, response, data) => {
        if (error) {
          console.log("ERROR");
          console.dir(error);
        }

        console.log(data);
        var newjson = JSON.parse(data);
        resolve({"url": url.resolve("https://streamja.com/", newjson.url)});
      });
    });
  });
}

if (require.main === module) {
  if (process.argv[2])
    upload(process.argv[2]).then((data) => {
      console.dir(data);
    });
}
