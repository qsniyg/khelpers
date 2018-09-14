'use strict';

var fs = require('fs');
var child_process = require('child_process');
var readlineSync = require('readline-sync');

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

function main() {
  if (process.argv.length < 4) {
    console.log("videofile orientation");
    return;
  }

  var videofile = process.argv[2];
  var orient = process.argv[3];

  if (!fs.existsSync(videofile)) {
    console.log("videofile needs to exist");
    return;
  }

  if (!orient.match(/^[-0-9]+$/)) {
    console.log("orientation is not a number");
    return;
  }

  if (orient !== "90" &&
      orient !== "-90" &&
      orient !== "270" &&
      orient !== "-270" &&
      orient !== "180") {
    console.log("orientation not valid");
    return;
  }

  if (!run_process("ffmpeg", [
    "-i", videofile,
    "-c", "copy",
    "-metadata:s:v:0",
    "rotate=" + orient,
    "/tmp/rotated.mp4"
  ])) {
    console.log("Failed to run ffmpeg");
    return;
  }

  run_process("mpv", ["/tmp/rotated.mp4"]);
  if (!readlineSync.keyInYNStrict("[unrotated] Do you wish to continue?")) {
    return;
  }

  if (!readlineSync.keyInYNStrict("[unrotated] Are you sure?")) {
    return;
  }

  if (!run_process("node", [
    "youtubeul.js", videofile,
    "real=/tmp/rotated.mp4"
  ])) {
    console.log("Error running youtubeul.js");
    return;
  }
}

main();
