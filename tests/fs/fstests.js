'use strict';

var passed = 0, failed = 0, then = performance.now();
function is(a, b, msg) {
  if (a == b) {
    ++passed;
    console.log("PASS " + msg);
  } else {
    ++failed;
    console.log("FAIL " + msg);
    console.log("GOT: " + JSON.stringify(a));
    console.log("EXPECTED: " + JSON.stringify(b));
  }
}

function ok(a, msg) {
  if (!!a) {
    ++passed;
    console.log("PASS " + msg);
  } else {
    ++failed;
    console.log("FAIL " + msg);
  }
}

/**
 * Convert a callback-based fs function to a Promise-based one.
 * Requires the original function to take a callback as its last argument
 * and callers to pass all previous arguments.
 */
var promisify = function(fn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    return new Promise(function(resolve, reject) {
      args.push(resolve);
      try {
        fs[fn].apply(fs, args);
      } catch(ex) {
        reject(ex);
      }
    });
  };
};

// A promise-based fs API.  Wraps callback-based functions in promise-based ones
// using promisify.  
var promiseFS = {};
[
  "stat",
  "open",
  "exportStore",
  "importStore",
].forEach(function(fn) { promiseFS[fn] = promisify(fn) });

/**
 * Given the path to a directory, return the stat objects of its children,
 * each of which also contains a *name* property and either a *children*
 * or a *data* property (depending on whether it's a directory or a file)
 * containing the dir/file's children or data.
 *
 * For example, getBranch("/") might return:
 *
 * [
 *   {
 *     "isDir": true,
 *     "mtime": 1419059838990,
 *     "name": "tmp",
 *     "children": [
 *       {
 *         "isDir": false,
 *         "mtime": 1419059839096,
 *         "size": 0,
 *         "name": "tmp2.txt",
 *         "data": []
 *       }
 *     ]
 *   },
 *   {
 *     "isDir": false,
 *     "mtime": 1419059839115,
 *     "size": 4,
 *     "name": "file2",
 *     "data": [49, 50, 51, 52]
 *   }
 * ]
 *
 * The purpose of this function is to generate a representation of the fs,
 * including file data, by recursively retrieving each directory and its files.
 * This is useful for comparing the state of the fs before and after changes
 * that shouldn't affect it (f.e. exporting the store and then reimporting it).
 *
 * We convert file data into arrays to make it easier to compare them.
 */
var getBranch = function(dir) {
  return new Promise(function(resolve, reject) {
    fs.list(dir, function(error, files) {
      Promise.all(files.map(function(file) {
        return new Promise(function(resolve, reject) {
          var path = dir + file;
          promiseFS.stat(path).then(function(stat) {
            stat.name = file;
            if (stat.isDir) {
              getBranch(path).then(function(children) {
                stat.children = children;
                resolve(stat);
              });
            } else {
              promiseFS.open(path).then(function(fd) {
                stat.data = Array.prototype.slice.call(fs.read(fd));
                fs.close(fd);
                resolve(stat);
              });
            }
          });
        });
      })).then(resolve);
    });
  });
};

var tests = [];

var fd;

function next() {
  if (tests.length == 0) {
    ok(true, "TESTS COMPLETED");
    console.log("DONE: " + passed + " PASS, " + failed + " FAIL, " +
                (Math.round(performance.now() - then)) + " TIME");
  } else {
    var test = tests.shift();
    test();
  }
}

tests.push(function() {
  fs.exists("/", function(exists) {
    is(exists, true, "root directory exists");
    next();
  });
});

tests.push(function() {
  fs.stat("/", function(stat) {
    ok(stat.isDir, "/ is a directory");
    next();
  });
});

tests.push(function() {
  fs.list("/", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 0, "files is an empty array");
    next();
  })
});

tests.push(function() {
  fs.list("/tmp", function(error, files) {
    is(error.message, "Path does not exist", "can't list a path that does not exist");
    next();
  });
});

tests.push(function() {
  fs.open("/", function(fd) {
    is(fd, -1, "can't open a directory");
    next();
  });
});

tests.push(function() {
  fs.close(-1);
  next();
});

tests.push(function() {
  fs.close(0);
  next();
});

tests.push(function() {
  fs.close(1);
  next();
});

tests.push(function() {
  fs.mkdir("/prova/", function(created) {
    is(created, true, "created a directory");
    next();
  });
});

tests.push(function() {
  fs.remove("/prova/", function(removed) {
    is(removed, true, "removed a directory");
    next();
  });
});

tests.push(function() {
  fs.mkdir("/tmp", function(created) {
    is(created, true, "created a directory");
    next();
  });
});

tests.push(function() {
  fs.mkdir("/tmp/ciao", function(created) {
    is(created, true, "created a directory");
    next();
  });
});

tests.push(function() {
  fs.stat("/tmp", function(stat) {
    ok(stat.isDir, "/tmp is a directory");
    next();
  });
});

tests.push(function() {
  fs.create("/tmp", new Blob(), function(created) {
    is(created, false, "can't create a file with the same path of an already existing directory");
    next();
  });
});

tests.push(function() {
  fs.stat("/tmp", function(stat) {
    ok(stat.isDir, "/tmp is still a directory");
    next();
  });
});

tests.push(function() {
  fs.create("/non-existent-dir/tmp", new Blob(), function(created) {
    is(created, false, "can't create a file in a non-existent directory");
    next();
  });
});

tests.push(function() {
  fs.exists("/non-existent-dir", function(exists) {
    is(exists, false, "non-existent directory still doesn't exist");
    next();
  });
});

tests.push(function() {
  fs.mkdir("/tmp", function(created) {
    is(created, false, "can't create a directory with the same path of an already existing directory");
    next();
  });
});

tests.push(function() {
  fs.create("/tmp/tmp.txt", new Blob(), function(created) {
    is(created, true, "created a file");
    next();
  });
});

tests.push(function() {
  fs.create("/tmp/tmp.txt", new Blob(), function(created) {
    is(created, false, "can't create a file that already exists");
    next();
  });
});

tests.push(function() {
  fs.stat("/tmp/tmp.txt", function(stat) {
    ok(!stat.isDir, "/tmp/tmp.txt is not a directory");
    next();
  });
});

tests.push(function() {
  fs.mkdir("/tmp/tmp.txt", function(created) {
    is(created, false, "can't create a directory with the same path of an already existing file");
    next();
  });
});

tests.push(function() {
  fs.stat("/tmp/tmp.txt", function(stat) {
    ok(!stat.isDir, "/tmp/tmp.txt is still not a directory");
    next();
  });
});

tests.push(function() {
  fs.size("/tmp/tmp.txt", function(size) {
    is(size, 0, "newly created file's size is 0");
    next();
  });
});

tests.push(function() {
  fs.size("/tmp", function(size) {
    is(size, -1, "can't get directory size");
    next();
  });
});

tests.push(function() {
  fs.list("/", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 1, "files is an array with 1 element: " + files);
    is(files[0], "tmp/", "tmp is in files");
    next();
  })
});

tests.push(function() {
  fs.list("/tmp", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 2, "files is an empty array");
    is(files[0], "ciao/", "ciao is in files");
    is(files[1], "tmp.txt", "tmp.txt is in files");
    next();
  })
});

tests.push(function() {
  fs.list("/tmp/ciao", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 0, "files is an empty array");
    next();
  })
});

tests.push(function() {
  fs.truncate("/tmp", function(truncated) {
    is(truncated, false, "can't truncate a directory");
    next();
  })
});

tests.push(function() {
  fs.truncate("/tmp/tmp.txt", function(truncated) {
    is(truncated, true, "truncated a file");
    next();
  })
});

tests.push(function() {
  fs.size("/tmp/tmp.txt", function(size) {
    is(size, 0, "truncated file's size is 0");
    next();
  });
});

tests.push(function() {
  fs.list("/tmp/tmp.txt", function(error, files) {
    is(error.message, "Path is not a directory", "can't list the children of a file");
    next();
  });
});

tests.push(function() {
  fs.create("/tmp/ciao/tmp.txt", new Blob(), function(created) {
    is(created, true, "created a file");
    next();
  });
});

tests.push(function() {
  fs.mkdir("/tmp/ciao/tmp", function(created) {
    is(created, true, "created a directory");
    next();
  });
});

tests.push(function() {
  fs.list("/tmp/ciao", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 2, "files has 2 entries");
    is(files[0], "tmp.txt", "tmp.txt is in files");
    is(files[1], "tmp/", "tmp is in files");
    next();
  })
});

tests.push(function() {
  fs.remove("/tmp/ciao/tmp.txt", function(removed) {
    is(removed, true, "removed a file");
    next();
  });
});

tests.push(function() {
  fs.exists("/tmp/ciao/tmp.txt", function(exists) {
    is(exists, false, "removed file doesn't exist");
    next();
  });
});

tests.push(function() {
  fs.list("/tmp/ciao", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 1, "files has 1 entry");
    is(files[0], "tmp/", "tmp is in files");
    next();
  })
});

tests.push(function() {
  fs.remove("/tmp/ciao", function(removed) {
    is(removed, false, "can't remove a dir with children");
    next();
  });
});

tests.push(function() {
  fs.remove("/tmp/ciao/tmp", function(removed) {
    is(removed, true, "removed a directory");
    next();
  });
});

tests.push(function() {
  fs.exists("/tmp/ciao/tmp", function(exists) {
    is(exists, false, "removed dir doesn't exist");
    next();
  });
});

tests.push(function() {
  fs.list("/tmp/ciao", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 0, "files is empty");
    next();
  })
});

tests.push(function() {
  fs.remove("/tmp/ciao", function(removed) {
    is(removed, true, "removed a directory");
    next();
  });
});

tests.push(function() {
  fs.list("/tmp", function(error, files) {
    ok(files instanceof Array, "files is an array");
    is(files.length, 1, "files has one entry");
    is(files[0], "tmp.txt", "tmp.txt is in files");
    next();
  })
});

tests.push(function() {
  fs.open("/tmp/tmp.txt", function(fd) {
    is(fd, 3, "opened a file");
    next();
  });
});

tests.push(function() {
  fs.close(3);
  next();
});

tests.push(function() {
  fs.open("/tmp/tmp.txt", function(newFd) {
    is(newFd, 4, "reopened a file");
    fd = newFd;
    next();
  });
});

tests.push(function() {
  var data = fs.read(fd);
  is(data.byteLength, 0, "read from an empty file");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 5);
  is(data.byteLength, 0, "trying to read empty file with from > file size");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 0, 5);
  is(data.byteLength, 0, "trying to read too much with empty file");
  next();
});

tests.push(function() {
  fs.write(fd, new TextEncoder().encode("marco"));
  next();
});

tests.push(function() {
  var data = fs.read(fd, 10);
  is(data.byteLength, 0, "trying to read with from > file size");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 5);
  is(data.byteLength, 0, "trying to read with from == file size");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 0, 10);
  is(data.byteLength, 5, "trying to read too much");
  is(new TextDecoder().decode(data), "marco", "read correct");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 5, "read from a file with 5 bytes");
  is(new TextDecoder().decode(data), "marco", "read correct");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  fs.write(fd, new TextEncoder().encode("marco2"));
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 6, "read from a file with 6 bytes");
  is(new TextDecoder().decode(data), "marco2", "read correct");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 1);
  is(data.byteLength, 5, "read 5 bytes from a file with 6 bytes");
  is(new TextDecoder().decode(data), "arco2", "read correct");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 0, 1);
  is(data.byteLength, 1, "read 1 byte from a file with 6 bytes");
  is(new TextDecoder().decode(data), "m", "read correct");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 1, 3);
  is(data.byteLength, 2, "read 2 bytes from a file with 6 bytes");
  is(new TextDecoder().decode(data), "ar", "read correct");
  next();
});

tests.push(function() {
  var data = fs.read(fd, 1, 1);
  is(data.byteLength, 0, "read 0 bytes from a file with 5 bytes");
  is(new TextDecoder().decode(data), "", "read correct");
  next();
});

tests.push(function() {
  fs.write(fd, new TextEncoder().encode("marco"), 1);
  ok(true, "write with from");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 6, "read from a file with 6 bytes");
  is(new TextDecoder().decode(data), "mmarco", "read correct");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  fs.write(fd, new TextEncoder().encode("mar"));
  ok(true, "write overwriting first bytes");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 6, "read from a file with 6 bytes");
  is(new TextDecoder().decode(data), "marrco", "read correct");
  next();
});

tests.push(function() {
  fs.write(fd, new TextEncoder().encode("marco"), 2);
  ok(true, "write overwriting and appending");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 7, "read from a file with 7 bytes");
  is(new TextDecoder().decode(data), "mamarco", "read correct");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  fs.write(fd, new TextEncoder().encode("marco"), 20);
  ok(true, "write appending with from > size of file");
  next();
});

tests.push(function() {
  fs.setpos(fd, 0);
  var data = fs.read(fd);
  is(data.byteLength, 12, "read from a file with 12 bytes");
  is(new TextDecoder().decode(data), "mamarcomarco", "read correct");
  next();
});

tests.push(function() {
  fs.size("/tmp/tmp.txt", function(size) {
    is(size, 0, "unflushed file's size is 0");
    next();
  });
});

tests.push(function() {
  fs.flush(fd);
  ok(true, "file data flushed");
  next();
});

tests.push(function() {
  is(fs.getsize(fd), 12, "file's size is 12");
  next();
});

tests.push(function() {
  is(fs.getsize(2), -1, "getsize fails with an invalid fd");
  next();
});

tests.push(function() {
  fs.ftruncate(fd, 6);
  is(fs.getsize(fd), 6, "truncated file's size is 6");
  next();
});

tests.push(function() {
  // Test writing enough data to make the fs internal buffer increase (exponentially)
  fs.write(fd, new Uint8Array(6065), 6);

  is(fs.getsize(fd), 6071, "file size is now 6071");

  var data = fs.read(fd, 0);

  is(new TextDecoder().decode(data).substring(0, 6), "mamarc", "read correct");

  next();
});

tests.push(function() {
  // Test writing enough data to make the fs internal buffer increase (linearly)
  fs.write(fd, new Uint8Array(131073), 6);

  is(fs.getsize(fd), 131079, "file size is now 131079");

  var data = fs.read(fd, 0);

  is(new TextDecoder().decode(data).substring(0, 6), "mamarc", "read correct");

  next();
});

tests.push(function() {
  fs.close(fd);
  next();
});

tests.push(function() {
  fs.size("/tmp/tmp.txt", function(size) {
    is(size, 131079, "file's size after closing is 131079");
    next();
  });
});

tests.push(function() {
  fs.truncate("/tmp/tmp.txt", function(truncated) {
    is(truncated, true, "truncated a file");
    next();
  })
});

tests.push(function() {
  fs.size("/tmp/tmp.txt", function(size) {
    is(size, 0, "truncated file's size is 0");
    next();
  });
});

tests.push(function() {
  fs.rename("/tmp/tmp.txt", "/tmp/tmp2.txt", function(renamed) {
    ok(renamed, "File renamed");
    next();
  });
});

tests.push(function() {
  fs.create("/file", new Blob([1,2,3,4]), function(created) {
    ok(created, "File created");
    fs.rename("/file", "/file2", function(renamed) {
      ok(renamed, "File renamed");
      fs.size("/file2", function(size) {
        is(size, 4, "Renamed file size is correct");
        fs.exists("/file", function(exists) {
          ok(!exists, "file doesn't exist anymore");
          next();
        });
      });
    });
  });
});

tests.push(function() {
  fs.mkdir("/newdir", function(created) {
    ok(created, "Directory created");
    fs.rename("/newdir", "/newdir2", function(renamed) {
      ok(renamed, "Directory renamed");
      fs.exists("/newdir", function(exists) {
        ok(!exists, "newdir doesn't exist anymore");
        next();
      });
    });
  });
});

tests.push(function() {
  fs.rename("/tmp", "/tmp3", function(renamed) {
    ok(!renamed, "Can't rename a non-empty directory");
    fs.exists("/tmp", function(exists) {
      ok(exists, "Directory still exists after an error while renaming");
      next();
    });
  });
});

tests.push(function() {
  fs.rename("/tmp", "/newdir2", function(renamed) {
    ok(!renamed, "Can't rename a directory with a path to a directory that already exists");
    fs.exists("/tmp", function(exists) {
      ok(exists, "Directory still exists after an error while renaming");
      next();
    });
  });
});

tests.push(function() {
  fs.rename("/nonexisting", "/nonexising2", function(renamed) {
    ok(!renamed, "Can't rename a non-existing file");
    next();
  });
});

// stat/mtime tests
// These are meant to be run in order, so be careful when changing them!
(function() {
  var lastTime = Date.now();
  var fd;

  tests.push(function() {
    fs.stat("/tmp/stat.txt", function(stat) {
      is(stat, null, "nonexistent file doesn't have stat");
      next();
    });
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.create("/tmp/stat.txt", new Blob(), function(created) {
        fs.stat("/tmp/stat.txt", function(stat) {
          ok(stat.mtime > lastTime, "create updates mtime");
          lastTime = stat.mtime;
          next();
        });
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.open("/tmp/stat.txt", function(aFD) {
        fd = aFD;
        fs.stat("/tmp/stat.txt", function(stat) {
          is(stat.mtime, lastTime, "open doesn't update mtime");
          lastTime = stat.mtime;
          next();
        });
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.flush(fd);
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat.mtime, lastTime, "flush on just opened file doesn't update mtime");
        lastTime = stat.mtime;
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.write(fd, new TextEncoder().encode("mi"));
      fs.stat("/tmp/stat.txt", function(stat) {
        ok(stat.mtime, lastTime, "write without flush doesn't update mtime");
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.write(fd, new TextEncoder().encode("sc"));
      fs.flush(fd);
      fs.stat("/tmp/stat.txt", function(stat) {
        ok(stat.mtime > lastTime, "write and then flush updates mtime");
        lastTime = stat.mtime;
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.flush(fd);
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat.mtime, lastTime, "flush on non-dirty file doesn't change mtime");
        lastTime = stat.mtime;
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.ftruncate(fd, 4);
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat.mtime, lastTime, "ftruncate to same size doesn't update mtime");
        lastTime = stat.mtime;
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.ftruncate(fd, 5);
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat.mtime, lastTime, "ftruncate to larger size doesn't update mtime");
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.ftruncate(fd, 3);
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat.mtime, lastTime, "ftruncate to smaller size doesn't update mtime");
        next();
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.close(fd);
      fs.stat("/tmp/stat.txt", function(stat) {
        ok(stat.mtime > lastTime, "close after changes updates mtime");
        lastTime = stat.mtime;
        next();
      });
    }, 1);
  });

  tests.push(function() {
    fs.open("/tmp/stat.txt", function(fd) {
      fs.stat("/tmp/stat.txt", function(stat) {
        var mtime = stat.mtime;
        window.setTimeout(function() {
          fs.close(fd);
          fs.stat("/tmp/stat.txt", function(stat) {
            is(stat.mtime, mtime, "close without changes doesn't update mtime");
            next();
          });
        }, 1);
      });
    });
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.truncate("/tmp/stat.txt", function() {
        fs.stat("/tmp/stat.txt", function(stat) {
          ok(stat.mtime > lastTime, "truncate updates mtime");
          lastTime = stat.mtime;
          next();
        });
      });
    }, 1);
  });

  tests.push(function() {
    window.setTimeout(function() {
      fs.rename("/tmp/stat.txt", "/tmp/stat2.txt", function() {
        fs.stat("/tmp/stat2.txt", function(stat) {
          is(stat.mtime, lastTime, "rename doesn't update mtime");
          // Rename it back to its original name so the next test
          // doesn't have to know about the name change.
          fs.rename("/tmp/stat2.txt", "/tmp/stat.txt", function() {
            next();
          });
        });
      });
    }, 1);
  });

  tests.push(function() {
    fs.remove("/tmp/stat.txt", function() {
      fs.stat("/tmp/stat.txt", function(stat) {
        is(stat, null, "removed file no longer has stat");
        next();
      });
    });
  });
})();

tests.push(function() {
  fs.mkdir("/statDir", function() {
    fs.stat("/statDir", function(stat) {
      ok(stat.isDir, "/statDir is a directory");
      next();
    });
  });
});

tests.push(function() {
  fs.create("/statDir/file", new Blob(), function() {
    fs.stat("/statDir/file", function(stat) {
      ok(!stat.isDir, "/statDir/file isn't a directory");
      next();
    });
  });
});

tests.push(function() {
  fs.syncStore(function() {
    // There's nothing we can check, since the sync status of the store
    // is private to the fs module, but we have at least confirmed that the call
    // resulted in the callback being called.
    ok(true, "syncStore callback called");
    next();
  });
});

tests.push(function() {
  fs.create("/write-purge-read", new Blob(), function(created) {
    fs.open("/write-purge-read", function(fd) {
      fs.write(fd, new TextEncoder().encode("marco"));
      fs.close(fd);
      fs.purgeStore(function() {
        fs.open("/write-purge-read", function(fd) {
          var data = fs.read(fd);
          is(data.byteLength, 5, "read from a file with 5 bytes");
          is(new TextDecoder().decode(data), "marco", "read correct");
          fs.close(fd);
          fs.remove("/write-purge-read", function() {
            next();
          });
        });
      });
    });
  });
});

tests.push(function() {
  fs.addTransientPath("/transient-path");
  fs.create("/transient-path", new Blob(), function(created) {
    fs.open("/transient-path", function(fd) {
      fs.write(fd, new TextEncoder().encode("marco"));
      fs.close(fd);
      fs.purgeStore(function() {
        fs.exists("/transient-path", function(exists) {
          is(exists, false, "transient file doesn't exist after purge");
          next();
        });
      });
    });
  });
});

// Export the fs store, import it again, and verify that the state of the fs
// is equivalent.
tests.push(function() {
  var before;
  getBranch("/").then(function(branch) {
    before = branch;
    return promiseFS.exportStore();
  }).then(function(blob) {
    return promiseFS.importStore(blob);
  }).then(function() {
    return getBranch("/");
  }).then(function(after) {
    ok(QUnit.equiv(before, after), "files are equivalent after export/import");
    next();
  });
});

fs.init(function() {
  fs.clear(function() {
    next();
  });
});
