'use strict';

var parse_feeds = require('./parse_feeds');
var request = require('request');
var cheerio = require('cheerio');
var fs = require('fs');
var child_process = require('child_process');

var cut = [];
var videofile = null;
var youtubeurl = null;
var fullversion = null;

function parse_copyright_table(tr, id) {
  var $tr = cheerio(tr);

  var tds = $tr.children("td");
  if (tds.length !== 4) {
    console.error("TD length != 4: " + tds.length);
    return false;
  }

  var cuttype = null;
  var alltext = cheerio(tds[0]).text();
  if (alltext.indexOf("시청각 콘텐츠") >= 0 ||
      alltext.indexOf("동영상 콘텐츠") >= 0) {
    cuttype = "av";
  } else if (alltext.indexOf("음원") >= 0 ||
             alltext.indexOf("음악 작품") >= 0) {
    cuttype = "a";
  } else {
    console.log("Unknown cut type: " + parse_feeds.strip(alltext));
    return false;
  }

  var matchels = cheerio(tds[0]).find("ul > li");
  var matchel = matchels[matchels.length - 1];
  if (!matchel) {
    console.error("Audio match not found");
    return false;
  }

  var match = null;
  for (var i = 0; i < matchel.children.length; i++) {
    if (matchel.children[i].type !== 'text')
      continue;

    match = parse_feeds.strip(matchel.children[i].data);
    break;
  }

  if (match === null) {
    console.error("Audio match text not found");
    return false;
  }

  var matchobj = match.match(/(?:([0-9]+):)?([0-9]*):([0-9]*) - (?:([0-9]+):)?([0-9]*):([0-9]*)/);
  if (!matchobj) {
    console.error("Audio match incorrect: " + match);
    return false;
  }

  var sh = parseInt(matchobj[1] || 0);
  var sm = parseInt(matchobj[2]);
  var ss = parseInt(matchobj[3]);
  var eh = parseInt(matchobj[4] || 0);
  var em = parseInt(matchobj[5]);
  var es = parseInt(matchobj[6]);

  var start = sh * 3600 + sm * 60 + ss;
  var end = eh * 3600 + em * 60 + es;

  var policyel = cheerio(tds[2]).find("li.copynotice-claim-table-policy")[0];
  if (!policyel) {
    console.log("Policy not found");
    return false;
  }

  for (var i = 0; i < policyel.children.length; i++) {
    if (policyel.children[i].type !== 'text')
      continue;

    var data = parse_feeds.strip(policyel.children[i].data);
    if (data.indexOf("차단됨") >= 0) {
      console.log("Adding " + cuttype + " cut from " + match + " (" + start + "-" + end + ")");
      cut.push([start, end, cuttype]);
      return true;
    }
  }

  console.log("Ignoring audio entry " + id);
  return true;
}

function parse_copyright(body) {
  var cereal = cheerio.load(body);

  var children = cereal("table.copynotice-claim-details-table").find("tr");

  for (var i = 0; i < children.length; i++) {
    console.log(i);
    if (i === 0)
      continue;

    if (!parse_copyright_table(children[i], i))
      return;
  }

  if (cut.length > 0) {
    create_video();
  }
}

function run_process(processname, args) {
  console.log("");
  console.log(processname + " " + args.join(" "));
  console.log("");

  var result = child_process.spawnSync(processname, args, {
    stdio: [process.stdin, process.stdout, process.stderr]
  });
  if (!result || result.status !== 0) {
    return false;
  }
  return true;
}

var fferror = false;
function run_ffmpeg(args) {
  console.log("");
  console.log("ffmpeg " + args.join(" "));
  console.log("");

  var result = child_process.spawnSync("ffmpeg", args, {
    stdio: [process.stdin, process.stdout, process.stderr]
  });
  if (!result || result.status !== 0) {
    fferror = true;
    return false;
  }
  return true;
}

function seconds_to_timestamp(seconds) {
  seconds = parseInt(seconds);
  console.log(seconds);
  if (seconds < 0) {
    return "99:59:59.00";
  }

  var result = parse_feeds.pad(parseInt(seconds / 3600), 2) + ":";
  seconds = seconds % 3600;
  result += parse_feeds.pad(parseInt(seconds / 60), 2) + ":";
  seconds = seconds % 60;
  result += parse_feeds.pad(parseInt(seconds), 2) + ".00";
  return result;
}

function make_cut(outfile, start, end, noaudio) {
  var args = [
    "-seek_timestamp", "-2147483648.000000"
  ];

  if (start > 0) {
    args.push('-ss');
    args.push(seconds_to_timestamp(start));
  }

  args.push.apply(args,
                  [
                    '-to', seconds_to_timestamp(end)
                    //'-t', seconds_to_timestamp(end - start)
                  ]);

  args.push('-i');
  args.push(videofile);

  /*args.push.apply(args,
                  [
                    '-to', seconds_to_timestamp(end),
                    //'-t', seconds_to_timestamp(end - start),
                    '-y'
                  ]);*/

  if (noaudio) {
    //args.push("-an");
    args.push.apply(args,
                    [
                      '-f', 'lavfi',
                      '-i', 'anullsrc',
                      '-c:a', 'aac',
                      '-map', '0:v',
                      '-map', '1:a'
                    ]);
  } else {
    args.push("-c:a");
    args.push("copy");
  }

  args.push("-c:v");
  args.push("copy");
  args.push("-shortest");
  args.push("-y");

  args.push(outfile);

  return run_ffmpeg(args);
}

function cleanup(files) {
  for (var i = 0; i < files.length; i++) {
    console.log("Cleaning up " + files[i]);
    fs.unlinkSync(files[i]);
  }
}

function create_video() {
  var files = [];

  var lastcut = 0;
  for (var i = 0; i <= cut.length; i++) {
    var start, end, cuttype, length, filename;

    if (i < cut.length) {
      start = cut[i][0];
      end = cut[i][1];
      cuttype = cut[i][2];
    } else {
      start = -1;
      end = start;
      cuttype = "none";
    }
    length = end - start;

    if (start - lastcut > 0 || start < 0) {
      filename = "/tmp/remcopy_precut_" + i + ".mp4";
      files.push(filename);

      if (!make_cut(filename, lastcut, start, false))
        break;
    }

    if (length > 0 && cuttype === "a") {
      filename = "/tmp/remcopy_cut_" + i + ".mp4";
      files.push(filename);

      if (!make_cut(filename, start, end, true))
        break;
    }

    lastcut = end;
  }

  if (fferror) {
    console.error("Error running ffmpeg");
    cleanup(files);
    return false;
  }

  var filecontents = "";
  files.forEach((file) => {
    filecontents += "file '" + file + "'\n";
  });

  fs.writeFileSync("/tmp/remcopy_concat.txt", filecontents);
  files.push("/tmp/remcopy_concat.txt");

  if (!run_ffmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', '/tmp/remcopy_concat.txt',
    '-c', 'copy',
    "/tmp/remcopy.mp4"
  ])) {
    console.log("Error running final ffmpeg");
    //cleanup(files);
    return false;
  }

  cleanup(files);

  // keep for now
  if (upload_video("/tmp/remcopy.mp4")) {
    //fs.unlinkSync("/tmp/remcopy.mp4");
  } else {
    console.error("Error running youtubeul.js");
  }

  return true;
}

function upload_video(filename) {
  var pre_en = "(content id blocked part of this video, see here for the full version: %U )";
  var pre_kr = "(콘텐츠 ID가 이 영상의 몇몇 부분을 차단됐어요 풀영상은 %U )";

  pre_en = pre_en.replace("%U", fullversion);
  pre_kr = pre_kr.replace("%U", fullversion);

  if (!run_process("node", ["youtubeul.js", videofile,
                            "prepend=" + pre_en,
                            "prepend_kr=" + pre_kr,
                            "real=" + filename])) {
    return false;
  }

  return true;
}

function main() {
  if (process.argv.length < 5) {
    console.log("videofile youtubeurl fullversion");
    return;
  }

  videofile = process.argv[2];
  youtubeurl = process.argv[3];
  fullversion = process.argv[4];

  if (!fs.existsSync(videofile)) {
    console.log("videofile needs to exist");
    return;
  }

  if (!youtubeurl.match(/^https?:\/\//)) {
    console.log("youtubeurl needs to be a youtube video url");
    return;
  }

  if (!fullversion.match(/^https?:\/\//)) {
    console.log("fullversion needs to be a video url");
    return;
  }

  var youtubematch = youtubeurl.match(/:\/\/[^/]*\/[^/]*?[?&](?:v|video_id)=([^&]*)/);
  if (!youtubematch || !youtubematch[1]) {
    console.log("youtubeurl is not a video url");
    return;
  }

  youtubeurl = "https://www.youtube.com/video_copynotice?v=" + youtubematch[1];

  parse_feeds.parse_feeds().then((members) => {
    request({
      method: "GET",
      url: youtubeurl,
      gzip: true,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en",
        "Cache-Control": "max-age=0",
        "Sec-Metadata": "cause=forced, destination=document, target=top-level, site=cross-site",
        "User-Agent": parse_feeds.feeds_toml.general.youtube_ua,
        Cookie: parse_feeds.feeds_toml.general.youtube_cookie
      }
    }, (error, response, body) => {
      if (error) {
        console.error(error);
        reject(error);
        return;
      }

      //console.log(body);
      parse_copyright(body);
    });
  });
}

main();
