'use strict';

var fs = require('fs');
var child_process = require('child_process');
var readlineSync = require('readline-sync');

var outfile = "/tmp/rotated.mp4";

var process_error = false;
function run_process(processname, args) {
  console.log("");
  console.log(processname + " " + args.join(" "));
  console.log("");

  var result = child_process.spawnSync(processname, args, {
    stdio: [process.stdin, process.stdout, process.stderr]
  });
  if (!result || result.status !== 0) {
    process_error = true;
    return false;
  }
  return true;
}

function run_ffmpeg(args) {
  return run_process("ffmpeg", args);
}

function make_cut(infile, outfile, start, end, orient) {
  var args = [
    "-seek_timestamp", "-2147483648.000000"
  ];

  if (start) {
    args.push('-ss');
    args.push(start);
  }

  args.push('-to');
  args.push(end);

  args.push('-i');
  args.push(infile);

  args.push('-c');
  args.push('copy');

  if (orient !== "0" || true) {
    args.push('-metadata:s:v:0');
    args.push('rotate=' + orient);
  }

  args.push(outfile);
  args.push('-y');

  return run_ffmpeg(args);
}

function cleanup(files) {
  for (var i = 0; i < files.length; i++) {
    console.log("Cleaning up " + files[i]);
    fs.unlinkSync(files[i]);
  }
}

function create_video(infile, orients) {
  var files = [];

  for (var i = 0; i < orients.length; i++) {
    var start = orients[i][0], end;
    if (i + 1 === orients.length) {
      end = "99:59:59.00";
    } else {
      end = orients[i + 1][0];
    }

    var filename = "/tmp/rotated_cut_" + i + ".mp4";
    files.push(filename);
    make_cut(infile, filename, start, end, orients[i][1]);
  }

  if (process_error) {
    console.error("Error running ffmpeg");
    cleanup(files);
    return false;
  }

  var filecontents = "";
  files.forEach((file) => {
    filecontents += "file '" + file + "'\n";
  });

  fs.writeFileSync("/tmp/rotated_concat.txt", filecontents);
  files.push("/tmp/rotated_concat.txt");

  if (!run_ffmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', '/tmp/rotated_concat.txt',
    '-c', 'copy',
    outfile
  ])) {
    console.log("Error running final ffmpeg");
    //cleanup(files);
    return false;
  }

  cleanup(files);
  return true;
}

function check_orient(orient) {
  if (!orient.match(/^[-0-9]+$/)) {
    console.log("orientation " + orient + " is not a number");
    return false;
  }

  if (orient !== "0" &&
      orient !== "90" &&
      orient !== "-90" &&
      orient !== "270" &&
      orient !== "-270" &&
      orient !== "180") {
    console.log("orientation " + orient + " is not valid");
    return false;
  } else {
    return true;
  }
}

function fix_timestamp(timestamp) {
  if (!timestamp.match(/^[0-9:.]*$/)) {
    console.log("invalid timestamp: " + timestamp);
    return false;
  }

  timestamp = timestamp
    .replace(/\.([0-9])$/, ".$10")
    .replace(/\.([0-9][0-9])[0-9]+$/, ".$1")
    .replace(/^([^.]*[0-9])$/, "$1.00")
    .replace(/^([0-9])$/, "00:00:0$1")
    .replace(/^([0-9]{2})$/, "00:00:$1")
    .replace(/^([0-9]:[0-9]{2})$/, "00:0$1")
    .replace(/^([0-9]{2}:[0-9]{2})$/, "00:$1");

  return timestamp;
}

function main() {
  if (process.argv.length < 4) {
    console.log("videofile orientation");
    return;
  }

  var videofile = process.argv[2];
  var orients = [];
  var orient = process.argv[3];

  if (!fs.existsSync(videofile)) {
    console.log("videofile needs to exist");
    return;
  }

  if (!check_orient(orient))
    return;

  orients.push(["00:00:00.00", orient]);

  for (var i = 4; i < process.argv.length; i += 2) {
    var start = fix_timestamp(process.argv[i]);
    if (start === false)
      return;

    var orient1 = process.argv[i + 1];
    if (!check_orient(orient1))
      return;

    orients.push([start, orient1]);
  }

  /*if (!run_process("ffmpeg", [
    "-i", videofile,
    "-c", "copy",
    "-metadata:s:v:0",
    "rotate=" + orient,
    "/tmp/rotated.mp4"
  ])) {
    console.log("Failed to run ffmpeg");
    return;
    }*/

  // unfortunately multiple orientations don't work, due to the orientation being specified at the track head
  if (!create_video(videofile, orients))
    return;

  run_process("mpv", [outfile]);
  if (!readlineSync.keyInYNStrict("[unrotated] Do you wish to continue?")) {
    return;
  }

  if (!readlineSync.keyInYNStrict("[unrotated] Are you sure?")) {
    return;
  }

  if (!run_process("node", [
    "youtubeul.js", videofile,
    "real=" + outfile
  ])) {
    console.log("Error running youtubeul.js");
    return;
  }
}

main();
