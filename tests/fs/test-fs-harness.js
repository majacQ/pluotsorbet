/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var log = function() {
  var s = Array.prototype.join.call(arguments, ",");

  // Write it to the document body so the test automation harness
  // and manual testers can observe it.
  document.body.textContent += s + "\n";

  // Log it via console.log so it gets written to the test automation log.
  // XXX Commented out because `make test` currently fails if the test log
  // contains the text "FAIL", and this causes that text to appear in it.
  // console.log(s);
}

var passed = 0, failed = 0, then = performance.now();

function is(a, b, msg) {
  if (a == b) {
    ++passed;
    log("PASS " + msg);
  } else {
    ++failed;
    log("FAIL " + msg);
    log("GOT: " + JSON.stringify(a));
    log("EXPECTED: " + JSON.stringify(b));
  }
}

function ok(a, msg) {
  if (!!a) {
    ++passed;
    log("PASS " + msg);
  } else {
    ++failed;
    log("FAIL " + msg);
  }
}

var tests = [];

function next() {
  if (tests.length == 0) {
    ok(true, "TESTS COMPLETED");
    log("DONE: " + passed + " PASS, " + failed + " FAIL, " +
                (Math.round(performance.now() - then)) + " TIME");
  } else {
    var test = tests.shift();
    test();
  }
}

function checkPaths() {
  tests.push(function() {
    var i = -1;

    var checkNextPath = function() {
      if (++i < paths.length) {
        var path = paths[i];
        fs.exists(path, function(exists) {
          is(exists, true, path + " exists");
          checkNextPath();
        });
      } else {
        next();
      }
    };

    checkNextPath();
  });
}

function checkFilesByDir() {
  tests.push(function() {
    var dirs = Object.keys(filesByDir);
    var i = -1;

    var checkNextDir = function() {
      if (++i < dirs.length) {
        var dir = dirs[i];
        fs.list(dir, function(files) {
          ok(files instanceof Array, "directory list is an array");
          is(files.length, filesByDir[dir].length, "directory contains expected number of files");
          for (var j = 0; j < filesByDir[dir].length; j++) {
            is(files[j], filesByDir[dir][j], "file in position " + j + " is expected");
          }
          checkNextDir();
        });
      } else {
        next();
      }
    };

    checkNextDir();
  });
}
