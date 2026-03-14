if (typeof globalThis !== 'undefined') {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  globalThis.window.prompt = function(msg) {
    if (Module["getInput"]) {
      return Module["getInput"]();
    }
    return null;
  };
}

Module["setGetInput"] = function(f) {
  Module["getInput"] = f;
};

Module["setHandleThings"] = function(f) {
  Module["handleThings"] = f;
};

Module["runThings"] = function() {
  Module["calledRun"] = false;
  if (Module["callMain"]) {
    Module["callMain"](Array.prototype.slice.call(arguments));
  } else if (typeof callMain !== 'undefined') {
    callMain(Array.prototype.slice.call(arguments));
  }
};
