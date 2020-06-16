/*
 * File: iframeResizer.js
 * Desc: Force iframes to size to content.
 * Requires: iframeResizer.contentWindow.js to be loaded into the target frame.
 * Doc: https://github.com/davidjbradshaw/iframe-resizer
 * Author: David J. Bradshaw - dave@bradshaw.net
 * Contributor: Jure Mav - jure.mav@gmail.com
 * Contributor: Reed Dadoune - reed@dadoune.com
 */

(function (undefined) {
  "use strict";

  if (typeof window === "undefined") return; // don't run for server side render

  var count = 0,
    logEnabled = false,
    hiddenCheckEnabled = false,
    msgHeader = "message",
    msgHeaderLen = msgHeader.length,
    msgId = "[iFrameSizer]", //Must match iframe msg ID
    msgIdLen = msgId.length,
    pagePosition = null,
    requestAnimationFrame = window.requestAnimationFrame,
    resetRequiredMethods = {
      max: 1,
      scroll: 1,
      bodyScroll: 1,
      documentElementScroll: 1,
    },
    settings = {},
    timer = null,
    logId = "Host Page",
    defaults = {
      autoResize: true,
      bodyBackground: null,
      bodyMargin: null,
      bodyMarginV1: 8,
      bodyPadding: null,
      checkOrigin: true,
      inPageLinks: false,
      enablePublicMethods: true,
      heightCalculationMethod: "bodyOffset",
      id: "iFrameResizer",
      interval: 32,
      log: false,
      maxHeight: Infinity,
      maxWidth: Infinity,
      minHeight: 0,
      minWidth: 0,
      resizeFrom: "parent",
      scrolling: false,
      sizeHeight: true,
      sizeWidth: false,
      warningTimeout: 5000,
      tolerance: 0,
      widthCalculationMethod: "scroll",
      closedCallback: function () {},
      initCallback: function () {},
      messageCallback: function () {
        warn("MessageCallback function not defined");
      },
      resizedCallback: function () {},
      scrollCallback: function () {
        return true;
      },
    };

  function getMutationObserver() {
    return (
      window.MutationObserver ||
      window.WebKitMutationObserver ||
      window.MozMutationObserver
    );
  }

  function addEventListener(obj, evt, func) {
    /* istanbul ignore else */ // Not testable in PhantonJS
    if ("addEventListener" in window) {
      obj.addEventListener(evt, func, false);
    } else if ("attachEvent" in window) {
      //IE
      obj.attachEvent("on" + evt, func);
    }
  }

  function removeEventListener(el, evt, func) {
    /* istanbul ignore else */ // Not testable in phantonJS
    if ("removeEventListener" in window) {
      el.removeEventListener(evt, func, false);
    } else if ("detachEvent" in window) {
      //IE
      el.detachEvent("on" + evt, func);
    }
  }

  function setupRequestAnimationFrame() {
    var vendors = ["moz", "webkit", "o", "ms"],
      x;

    // Remove vendor prefixing if prefixed and break early if not
    for (x = 0; x < vendors.length && !requestAnimationFrame; x += 1) {
      requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
    }

    if (!requestAnimationFrame) {
      log("setup", "RequestAnimationFrame not supported");
    }
  }

  function getMyID(iframeId) {
    var retStr = "Host page: " + iframeId;

    if (window.top !== window.self) {
      if (window.parentIFrame && window.parentIFrame.getId) {
        retStr = window.parentIFrame.getId() + ": " + iframeId;
      } else {
        retStr = "Nested host page: " + iframeId;
      }
    }

    return retStr;
  }

  function formatLogHeader(iframeId) {
    return msgId + "[" + getMyID(iframeId) + "]";
  }

  function isLogEnabled(iframeId) {
    return settings[iframeId] ? settings[iframeId].log : logEnabled;
  }

  function log(iframeId, msg) {
    output("log", iframeId, msg, isLogEnabled(iframeId));
  }

  function info(iframeId, msg) {
    output("info", iframeId, msg, isLogEnabled(iframeId));
  }

  function warn(iframeId, msg) {
    output("warn", iframeId, msg, true);
  }

  function output(type, iframeId, msg, enabled) {
    if (true === enabled && "object" === typeof window.console) {
      console[type](formatLogHeader(iframeId), msg);
    }
  }

  function iFrameListener(event) {
    function resizeIFrame() {
      function resize() {
        setSize(messageData);
        setPagePosition(iframeId);
        callback("resizedCallback", messageData);
      }

      ensureInRange("Height");
      ensureInRange("Width");

      syncResize(resize, messageData, "init");
    }

    function processMsg() {
      var data = msg.substr(msgIdLen).split(":");

      return {
        iframe: settings[data[0]] && settings[data[0]].iframe,
        id: data[0],
        height: data[1],
        width: data[2],
        type: data[3],
      };
    }

    function ensureInRange(Dimension) {
      var max = Number(settings[iframeId]["max" + Dimension]),
        min = Number(settings[iframeId]["min" + Dimension]),
        dimension = Dimension.toLowerCase(),
        size = Number(messageData[dimension]);

      log(
        iframeId,
        "Checking " + dimension + " is in range " + min + "-" + max
      );

      if (size < min) {
        size = min;
        log(iframeId, "Set " + dimension + " to min value");
      }

      if (size > max) {
        size = max;
        log(iframeId, "Set " + dimension + " to max value");
      }

      messageData[dimension] = "" + size;
    }

    function isMessageFromIFrame() {
      function checkAllowedOrigin() {
        function checkList() {
          var i = 0,
            retCode = false;

          log(
            iframeId,
            "Checking connection is from allowed list of origins: " +
              checkOrigin
          );

          for (; i < checkOrigin.length; i++) {
            if (checkOrigin[i] === origin) {
              retCode = true;
              break;
            }
          }
          return retCode;
        }

        function checkSingle() {
          var remoteHost = settings[iframeId] && settings[iframeId].remoteHost;
          log(iframeId, "Checking connection is from: " + remoteHost);
          return origin === remoteHost;
        }

        return checkOrigin.constructor === Array ? checkList() : checkSingle();
      }

      var origin = event.origin,
        checkOrigin = settings[iframeId] && settings[iframeId].checkOrigin;

      if (checkOrigin && "" + origin !== "null" && !checkAllowedOrigin()) {
        throw new Error(
          "Unexpected message received from: " +
            origin +
            " for " +
            messageData.iframe.id +
            ". Message was: " +
            event.data +
            ". This error can be disabled by setting the checkOrigin: false option or by providing of array of trusted domains."
        );
      }

      return true;
    }

    function isMessageForUs() {
      return (
        msgId === ("" + msg).substr(0, msgIdLen) &&
        msg.substr(msgIdLen).split(":")[0] in settings
      ); //''+Protects against non-string msg
    }

    function isMessageFromMetaParent() {
      //Test if this message is from a parent above us. This is an ugly test, however, updating
      //the message format would break backwards compatibity.
      var retCode = messageData.type in { true: 1, false: 1, undefined: 1 };

      if (retCode) {
        log(iframeId, "Ignoring init message from meta parent page");
      }

      return retCode;
    }

    function getMsgBody(offset) {
      return msg.substr(msg.indexOf(":") + msgHeaderLen + offset);
    }

    function forwardMsgFromIFrame(msgBody) {
      log(
        iframeId,
        "MessageCallback passed: {iframe: " +
          messageData.iframe.id +
          ", message: " +
          msgBody +
          "}"
      );
      callback("messageCallback", {
        iframe: messageData.iframe,
        message: JSON.parse(msgBody),
      });
      log(iframeId, "--");
    }

    function getPageInfo() {
      var bodyPosition = document.body.getBoundingClientRect(),
        iFramePosition = messageData.iframe.getBoundingClientRect();

      return JSON.stringify({
        iframeHeight: iFramePosition.height,
        iframeWidth: iFramePosition.width,
        clientHeight: Math.max(
          document.documentElement.clientHeight,
          window.innerHeight || 0
        ),
        clientWidth: Math.max(
          document.documentElement.clientWidth,
          window.innerWidth || 0
        ),
        offsetTop: parseInt(iFramePosition.top - bodyPosition.top, 10),
        offsetLeft: parseInt(iFramePosition.left - bodyPosition.left, 10),
        scrollTop: window.pageYOffset,
        scrollLeft: window.pageXOffset,
      });
    }

    function sendPageInfoToIframe(iframe, iframeId) {
      function debouncedTrigger() {
        trigger(
          "Send Page Info",
          "pageInfo:" + getPageInfo(),
          iframe,
          iframeId
        );
      }

      debounceFrameEvents(debouncedTrigger, 32, iframeId);
    }

    function startPageInfoMonitor() {
      function setListener(type, func) {
        function sendPageInfo() {
          if (settings[id]) {
            sendPageInfoToIframe(settings[id].iframe, id);
          } else {
            stop();
          }
        }

        ["scroll", "resize"].forEach(function (evt) {
          log(id, type + evt + " listener for sendPageInfo");
          func(window, evt, sendPageInfo);
        });
      }

      function stop() {
        setListener("Remove ", removeEventListener);
      }

      function start() {
        setListener("Add ", addEventListener);
      }

      var id = iframeId; //Create locally scoped copy of iFrame ID

      start();

      if (settings[id]) {
        settings[id].stopPageInfo = stop;
      }
    }

    function stopPageInfoMonitor() {
      if (settings[iframeId] && settings[iframeId].stopPageInfo) {
        settings[iframeId].stopPageInfo();
        delete settings[iframeId].stopPageInfo;
      }
    }

    function checkIFrameExists() {
      var retBool = true;

      if (null === messageData.iframe) {
        warn(iframeId, "IFrame (" + messageData.id + ") not found");
        retBool = false;
      }
      return retBool;
    }

    function getElementPosition(target) {
      var iFramePosition = target.getBoundingClientRect();

      getPagePosition(iframeId);

      return {
        x: Math.floor(Number(iFramePosition.left) + Number(pagePosition.x)),
        y: Math.floor(Number(iFramePosition.top) + Number(pagePosition.y)),
      };
    }

    function scrollRequestFromChild(addOffset) {
      /* istanbul ignore next */ //Not testable in Karma
      function reposition() {
        pagePosition = newPosition;
        scrollTo();
        log(iframeId, "--");
      }

      function calcOffset() {
        return {
          x: Number(messageData.width) + offset.x,
          y: Number(messageData.height) + offset.y,
        };
      }

      function scrollParent() {
        if (window.parentIFrame) {
          window.parentIFrame["scrollTo" + (addOffset ? "Offset" : "")](
            newPosition.x,
            newPosition.y
          );
        } else {
          warn(
            iframeId,
            "Unable to scroll to requested position, window.parentIFrame not found"
          );
        }
      }

      var offset = addOffset
          ? getElementPosition(messageData.iframe)
          : { x: 0, y: 0 },
        newPosition = calcOffset();

      log(
        iframeId,
        "Reposition requested from iFrame (offset x:" +
          offset.x +
          " y:" +
          offset.y +
          ")"
      );

      if (window.top !== window.self) {
        scrollParent();
      } else {
        reposition();
      }
    }

    function scrollTo() {
      if (false !== callback("scrollCallback", pagePosition)) {
        setPagePosition(iframeId);
      } else {
        unsetPagePosition();
      }
    }

    function findTarget(location) {
      function jumpToTarget() {
        var jumpPosition = getElementPosition(target);

        log(
          iframeId,
          "Moving to in page link (#" +
            hash +
            ") at x: " +
            jumpPosition.x +
            " y: " +
            jumpPosition.y
        );
        pagePosition = {
          x: jumpPosition.x,
          y: jumpPosition.y,
        };

        scrollTo();
        log(iframeId, "--");
      }

      function jumpToParent() {
        if (window.parentIFrame) {
          window.parentIFrame.moveToAnchor(hash);
        } else {
          log(
            iframeId,
            "In page link #" +
              hash +
              " not found and window.parentIFrame not found"
          );
        }
      }

      var hash = location.split("#")[1] || "",
        hashData = decodeURIComponent(hash),
        target =
          document.getElementById(hashData) ||
          document.getElementsByName(hashData)[0];

      if (target) {
        jumpToTarget();
      } else if (window.top !== window.self) {
        jumpToParent();
      } else {
        log(iframeId, "In page link #" + hash + " not found");
      }
    }

    function callback(funcName, val) {
      return chkCallback(iframeId, funcName, val);
    }

    function actionMsg() {
      if (settings[iframeId] && settings[iframeId].firstRun) firstRun();

      switch (messageData.type) {
        case "close":
          if (settings[iframeId].closeRequestCallback)
            chkCallback(
              iframeId,
              "closeRequestCallback",
              settings[iframeId].iframe
            );
          else closeIFrame(messageData.iframe);
          break;
        case "message":
          forwardMsgFromIFrame(getMsgBody(6));
          break;
        case "scrollTo":
          scrollRequestFromChild(false);
          break;
        case "scrollToOffset":
          scrollRequestFromChild(true);
          break;
        case "pageInfo":
          sendPageInfoToIframe(
            settings[iframeId] && settings[iframeId].iframe,
            iframeId
          );
          startPageInfoMonitor();
          break;
        case "pageInfoStop":
          stopPageInfoMonitor();
          break;
        case "inPageLink":
          findTarget(getMsgBody(9));
          break;
        case "reset":
          resetIFrame(messageData);
          break;
        case "init":
          resizeIFrame();
          callback("initCallback", messageData.iframe);
          break;
        default:
          resizeIFrame();
      }
    }

    function hasSettings(iframeId) {
      var retBool = true;

      if (!settings[iframeId]) {
        retBool = false;
        warn(
          messageData.type +
            " No settings for " +
            iframeId +
            ". Message was: " +
            msg
        );
      }

      return retBool;
    }

    function iFrameReadyMsgReceived() {
      for (var iframeId in settings) {
        trigger(
          "iFrame requested init",
          createOutgoingMsg(iframeId),
          document.getElementById(iframeId),
          iframeId
        );
      }
    }

    function firstRun() {
      if (settings[iframeId]) {
        settings[iframeId].firstRun = false;
      }
    }

    function clearWarningTimeout() {
      if (settings[iframeId]) {
        clearTimeout(settings[iframeId].msgTimeout);
        settings[iframeId].warningTimeout = 0;
      }
    }

    var msg = event.data,
      messageData = {},
      iframeId = null;

    if ("[iFrameResizerChild]Ready" === msg) {
      iFrameReadyMsgReceived();
    } else if (isMessageForUs()) {
      messageData = processMsg();
      iframeId = logId = messageData.id;
      if (settings[iframeId]) {
        settings[iframeId].loaded = true;
      }

      if (!isMessageFromMetaParent() && hasSettings(iframeId)) {
        log(iframeId, "Received: " + msg);

        if (checkIFrameExists() && isMessageFromIFrame()) {
          actionMsg();
        }
      }
    } else {
      info(iframeId, "Ignored: " + msg);
    }
  }

  function chkCallback(iframeId, funcName, val) {
    var func = null,
      retVal = null;

    if (settings[iframeId]) {
      func = settings[iframeId][funcName];

      if ("function" === typeof func) {
        retVal = func(val);
      } else {
        throw new TypeError(
          funcName + " on iFrame[" + iframeId + "] is not a function"
        );
      }
    }

    return retVal;
  }

  function removeIframeListeners(iframe) {
    var iframeId = iframe.id;
    delete settings[iframeId];
  }

  function closeIFrame(iframe) {
    var iframeId = iframe.id;
    log(iframeId, "Removing iFrame: " + iframeId);

    try {
      // Catch race condition error with React
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (e) {}

    chkCallback(iframeId, "closedCallback", iframeId);
    log(iframeId, "--");
    removeIframeListeners(iframe);
  }

  function getPagePosition(iframeId) {
    if (null === pagePosition) {
      pagePosition = {
        x:
          window.pageXOffset !== undefined
            ? window.pageXOffset
            : document.documentElement.scrollLeft,
        y:
          window.pageYOffset !== undefined
            ? window.pageYOffset
            : document.documentElement.scrollTop,
      };
      log(
        iframeId,
        "Get page position: " + pagePosition.x + "," + pagePosition.y
      );
    }
  }

  function setPagePosition(iframeId) {
    if (null !== pagePosition) {
      window.scrollTo(pagePosition.x, pagePosition.y);
      log(
        iframeId,
        "Set page position: " + pagePosition.x + "," + pagePosition.y
      );
      unsetPagePosition();
    }
  }

  function unsetPagePosition() {
    pagePosition = null;
  }

  function resetIFrame(messageData) {
    function reset() {
      setSize(messageData);
      trigger("reset", "reset", messageData.iframe, messageData.id);
    }

    log(
      messageData.id,
      "Size reset requested by " +
        ("init" === messageData.type ? "host page" : "iFrame")
    );
    getPagePosition(messageData.id);
    syncResize(reset, messageData, "reset");
  }

  function setSize(messageData) {
    function setDimension(dimension) {
      if (!messageData.id) {
        log("undefined", "messageData id not set");
        return;
      }
      messageData.iframe.style[dimension] = messageData[dimension] + "px";
      log(
        messageData.id,
        "IFrame (" +
          iframeId +
          ") " +
          dimension +
          " set to " +
          messageData[dimension] +
          "px"
      );
    }

    function chkZero(dimension) {
      //FireFox sets dimension of hidden iFrames to zero.
      //So if we detect that set up an event to check for
      //when iFrame becomes visible.

      /* istanbul ignore next */ //Not testable in PhantomJS
      if (!hiddenCheckEnabled && "0" === messageData[dimension]) {
        hiddenCheckEnabled = true;
        log(iframeId, "Hidden iFrame detected, creating visibility listener");
        fixHiddenIFrames();
      }
    }

    function processDimension(dimension) {
      setDimension(dimension);
      chkZero(dimension);
    }

    var iframeId = messageData.iframe.id;

    if (settings[iframeId]) {
      if (settings[iframeId].sizeHeight) {
        processDimension("height");
      }
      if (settings[iframeId].sizeWidth) {
        processDimension("width");
      }
    }
  }

  function syncResize(func, messageData, doNotSync) {
    /* istanbul ignore if */ //Not testable in PhantomJS
    if (doNotSync !== messageData.type && requestAnimationFrame) {
      log(messageData.id, "Requesting animation frame");
      requestAnimationFrame(func);
    } else {
      func();
    }
  }

  function trigger(calleeMsg, msg, iframe, id, noResponseWarning) {
    function postMessageToIFrame() {
      var target = settings[id] && settings[id].targetOrigin;
      log(
        id,
        "[" +
          calleeMsg +
          "] Sending msg to iframe[" +
          id +
          "] (" +
          msg +
          ") targetOrigin: " +
          target
      );
      iframe.contentWindow.postMessage(msgId + msg, target);
    }

    function iFrameNotFound() {
      warn(id, "[" + calleeMsg + "] IFrame(" + id + ") not found");
    }

    function chkAndSend() {
      if (
        iframe &&
        "contentWindow" in iframe &&
        null !== iframe.contentWindow
      ) {
        //Null test for PhantomJS
        postMessageToIFrame();
      } else {
        iFrameNotFound();
      }
    }

    function warnOnNoResponse() {
      function warning() {
        if (settings[id] && !settings[id].loaded && !errorShown) {
          errorShown = true;
          warn(
            id,
            "IFrame has not responded within " +
              settings[id].warningTimeout / 1000 +
              " seconds. Check iFrameResizer.contentWindow.js has been loaded in iFrame. This message can be ignored if everything is working, or you can set the warningTimeout option to a higher value or zero to suppress this warning."
          );
        }
      }

      if (
        !!noResponseWarning &&
        settings[id] &&
        !!settings[id].warningTimeout
      ) {
        settings[id].msgTimeout = setTimeout(
          warning,
          settings[id].warningTimeout
        );
      }
    }

    var errorShown = false;

    id = id || iframe.id;

    if (settings[id]) {
      chkAndSend();
      warnOnNoResponse();
    }
  }

  function createOutgoingMsg(iframeId) {
    return (
      iframeId +
      ":" +
      settings[iframeId].bodyMarginV1 +
      ":" +
      settings[iframeId].sizeWidth +
      ":" +
      settings[iframeId].log +
      ":" +
      settings[iframeId].interval +
      ":" +
      settings[iframeId].enablePublicMethods +
      ":" +
      settings[iframeId].autoResize +
      ":" +
      settings[iframeId].bodyMargin +
      ":" +
      settings[iframeId].heightCalculationMethod +
      ":" +
      settings[iframeId].bodyBackground +
      ":" +
      settings[iframeId].bodyPadding +
      ":" +
      settings[iframeId].tolerance +
      ":" +
      settings[iframeId].inPageLinks +
      ":" +
      settings[iframeId].resizeFrom +
      ":" +
      settings[iframeId].widthCalculationMethod
    );
  }

  function setupIFrame(iframe, options) {
    function setLimits() {
      function addStyle(style) {
        if (
          Infinity !== settings[iframeId][style] &&
          0 !== settings[iframeId][style]
        ) {
          iframe.style[style] = settings[iframeId][style] + "px";
          log(
            iframeId,
            "Set " + style + " = " + settings[iframeId][style] + "px"
          );
        }
      }

      function chkMinMax(dimension) {
        if (
          settings[iframeId]["min" + dimension] >
          settings[iframeId]["max" + dimension]
        ) {
          throw new Error(
            "Value for min" +
              dimension +
              " can not be greater than max" +
              dimension
          );
        }
      }

      chkMinMax("Height");
      chkMinMax("Width");

      addStyle("maxHeight");
      addStyle("minHeight");
      addStyle("maxWidth");
      addStyle("minWidth");
    }

    function newId() {
      var id = (options && options.id) || defaults.id + count++;
      if (null !== document.getElementById(id)) {
        id = id + count++;
      }
      return id;
    }

    function ensureHasId(iframeId) {
      logId = iframeId;
      if ("" === iframeId) {
        iframe.id = iframeId = newId();
        logEnabled = (options || {}).log;
        logId = iframeId;
        log(
          iframeId,
          "Added missing iframe ID: " + iframeId + " (" + iframe.src + ")"
        );
      }

      return iframeId;
    }

    function setScrolling() {
      log(
        iframeId,
        "IFrame scrolling " +
          (settings[iframeId] && settings[iframeId].scrolling
            ? "enabled"
            : "disabled") +
          " for " +
          iframeId
      );
      iframe.style.overflow =
        false === (settings[iframeId] && settings[iframeId].scrolling)
          ? "hidden"
          : "auto";
      switch (settings[iframeId] && settings[iframeId].scrolling) {
        case "omit":
          break;
        case true:
          iframe.scrolling = "yes";
          break;
        case false:
          iframe.scrolling = "no";
          break;
        default:
          iframe.scrolling = settings[iframeId]
            ? settings[iframeId].scrolling
            : "no";
      }
    }

    //The V1 iFrame script expects an int, where as in V2 expects a CSS
    //string value such as '1px 3em', so if we have an int for V2, set V1=V2
    //and then convert V2 to a string PX value.
    function setupBodyMarginValues() {
      if (
        "number" ===
          typeof (settings[iframeId] && settings[iframeId].bodyMargin) ||
        "0" === (settings[iframeId] && settings[iframeId].bodyMargin)
      ) {
        settings[iframeId].bodyMarginV1 = settings[iframeId].bodyMargin;
        settings[iframeId].bodyMargin =
          "" + settings[iframeId].bodyMargin + "px";
      }
    }

    function checkReset() {
      // Reduce scope of firstRun to function, because IE8's JS execution
      // context stack is borked and this value gets externally
      // changed midway through running this function!!!
      var firstRun = settings[iframeId] && settings[iframeId].firstRun,
        resetRequertMethod =
          settings[iframeId] &&
          settings[iframeId].heightCalculationMethod in resetRequiredMethods;

      if (!firstRun && resetRequertMethod) {
        resetIFrame({ iframe: iframe, height: 0, width: 0, type: "init" });
      }
    }

    function setupIFrameObject() {
      if (Function.prototype.bind && settings[iframeId]) {
        //Ignore unpolyfilled IE8.
        settings[iframeId].iframe.iFrameResizer = {
          close: closeIFrame.bind(null, settings[iframeId].iframe),

          removeListeners: removeIframeListeners.bind(
            null,
            settings[iframeId].iframe
          ),

          resize: trigger.bind(
            null,
            "Window resize",
            "resize",
            settings[iframeId].iframe
          ),

          moveToAnchor: function (anchor) {
            trigger(
              "Move to anchor",
              "moveToAnchor:" + anchor,
              settings[iframeId].iframe,
              iframeId
            );
          },

          sendMessage: function (message) {
            message = JSON.stringify(message);
            trigger(
              "Send Message",
              "message:" + message,
              settings[iframeId].iframe,
              iframeId
            );
          },
        };
      }
    }

    //We have to call trigger twice, as we can not be sure if all
    //iframes have completed loading when this code runs. The
    //event listener also catches the page changing in the iFrame.
    function init(msg) {
      function iFrameLoaded() {
        trigger("iFrame.onload", msg, iframe, undefined, true);
        checkReset();
      }

      function createDestroyObserver(MutationObserver) {
        if (!iframe.parentNode) {
          return;
        }

        var destroyObserver = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            var removedNodes = Array.prototype.slice.call(
              mutation.removedNodes
            ); // Transform NodeList into an Array
            removedNodes.forEach(function (removedNode) {
              if (removedNode === iframe) {
                closeIFrame(iframe);
              }
            });
          });
        });
        destroyObserver.observe(iframe.parentNode, {
          childList: true,
        });
      }

      var MutationObserver = getMutationObserver();
      if (MutationObserver) {
        createDestroyObserver(MutationObserver);
      }

      addEventListener(iframe, "load", iFrameLoaded);
      trigger("init", msg, iframe, undefined, true);
    }

    function checkOptions(options) {
      if ("object" !== typeof options) {
        throw new TypeError("Options is not an object");
      }
    }

    function copyOptions(options) {
      for (var option in defaults) {
        if (defaults.hasOwnProperty(option)) {
          settings[iframeId][option] = options.hasOwnProperty(option)
            ? options[option]
            : defaults[option];
        }
      }
    }

    function getTargetOrigin(remoteHost) {
      return "" === remoteHost || "file://" === remoteHost ? "*" : remoteHost;
    }

    function processOptions(options) {
      options = options || {};
      settings[iframeId] = {
        firstRun: true,
        iframe: iframe,
        remoteHost: iframe.src.split("/").slice(0, 3).join("/"),
      };

      checkOptions(options);
      copyOptions(options);

      if (settings[iframeId]) {
        settings[iframeId].targetOrigin =
          true === settings[iframeId].checkOrigin
            ? getTargetOrigin(settings[iframeId].remoteHost)
            : "*";
      }
    }

    function beenHere() {
      return iframeId in settings && "iFrameResizer" in iframe;
    }

    var iframeId = ensureHasId(iframe.id);

    if (!beenHere()) {
      processOptions(options);
      setScrolling();
      setLimits();
      setupBodyMarginValues();
      init(createOutgoingMsg(iframeId));
      setupIFrameObject();
    } else {
      warn(iframeId, "Ignored iFrame, already setup.");
    }
  }

  function debouce(fn, time) {
    if (null === timer) {
      timer = setTimeout(function () {
        timer = null;
        fn();
      }, time);
    }
  }

  var frameTimer = {};

  function debounceFrameEvents(fn, time, frameId) {
    if (!frameTimer[frameId]) {
      frameTimer[frameId] = setTimeout(function () {
        frameTimer[frameId] = null;
        fn();
      }, time);
    }
  } //Not testable in PhantomJS

  /* istanbul ignore next */
  function fixHiddenIFrames() {
    function checkIFrames() {
      function checkIFrame(settingId) {
        function chkDimension(dimension) {
          return (
            "0px" ===
            (settings[settingId] && settings[settingId].iframe.style[dimension])
          );
        }

        function isVisible(el) {
          return null !== el.offsetParent;
        }

        if (
          settings[settingId] &&
          isVisible(settings[settingId].iframe) &&
          (chkDimension("height") || chkDimension("width"))
        ) {
          trigger(
            "Visibility change",
            "resize",
            settings[settingId].iframe,
            settingId
          );
        }
      }

      for (var settingId in settings) {
        checkIFrame(settingId);
      }
    }

    function mutationObserved(mutations) {
      log(
        "window",
        "Mutation observed: " + mutations[0].target + " " + mutations[0].type
      );
      debouce(checkIFrames, 16);
    }

    function createMutationObserver() {
      var target = document.querySelector("body"),
        config = {
          attributes: true,
          attributeOldValue: false,
          characterData: true,
          characterDataOldValue: false,
          childList: true,
          subtree: true,
        },
        observer = new MutationObserver(mutationObserved);

      observer.observe(target, config);
    }

    var MutationObserver = getMutationObserver();
    if (MutationObserver) {
      createMutationObserver();
    }
  }

  function resizeIFrames(event) {
    function resize() {
      sendTriggerMsg("Window " + event, "resize");
    }

    log("window", "Trigger event: " + event);
    debouce(resize, 16);
  } //Not testable in PhantomJS

  /* istanbul ignore next */ function tabVisible() {
    function resize() {
      sendTriggerMsg("Tab Visable", "resize");
    }

    if ("hidden" !== document.visibilityState) {
      log("document", "Trigger event: Visiblity change");
      debouce(resize, 16);
    }
  }

  function sendTriggerMsg(eventName, event) {
    function isIFrameResizeEnabled(iframeId) {
      return (
        settings[iframeId] &&
        "parent" === settings[iframeId].resizeFrom &&
        settings[iframeId].autoResize &&
        !settings[iframeId].firstRun
      );
    }

    for (var iframeId in settings) {
      if (isIFrameResizeEnabled(iframeId)) {
        trigger(eventName, event, document.getElementById(iframeId), iframeId);
      }
    }
  }

  function setupEventListeners() {
    addEventListener(window, "message", iFrameListener);

    addEventListener(window, "resize", function () {
      resizeIFrames("resize");
    });

    addEventListener(document, "visibilitychange", tabVisible);
    addEventListener(document, "-webkit-visibilitychange", tabVisible); //Andriod 4.4
    addEventListener(window, "focusin", function () {
      resizeIFrames("focus");
    }); //IE8-9
    addEventListener(window, "focus", function () {
      resizeIFrames("focus");
    });
  }

  function factory() {
    function init(options, element) {
      function chkType() {
        if (!element.tagName) {
          throw new TypeError("Object is not a valid DOM element");
        } else if ("IFRAME" !== element.tagName.toUpperCase()) {
          throw new TypeError(
            "Expected <IFRAME> tag, found <" + element.tagName + ">"
          );
        }
      }

      if (element) {
        chkType();
        setupIFrame(element, options);
        iFrames.push(element);
      }
    }

    function warnDeprecatedOptions(options) {
      if (options && options.enablePublicMethods) {
        warn(
          "enablePublicMethods option has been removed, public methods are now always available in the iFrame"
        );
      }
    }

    var iFrames;

    setupRequestAnimationFrame();
    setupEventListeners();

    return function iFrameResizeF(options, target) {
      iFrames = []; //Only return iFrames past in on this call

      warnDeprecatedOptions(options);

      switch (typeof target) {
        case "undefined":
        case "string":
          Array.prototype.forEach.call(
            document.querySelectorAll(target || "iframe"),
            init.bind(undefined, options)
          );
          break;
        case "object":
          init(options, target);
          break;
        default:
          throw new TypeError("Unexpected data type (" + typeof target + ")");
      }

      return iFrames;
    };
  }

  function createJQueryPublicMethod($) {
    if (!$.fn) {
      info("", "Unable to bind to jQuery, it is not fully loaded.");
    } else if (!$.fn.iFrameResize) {
      $.fn.iFrameResize = function $iFrameResizeF(options) {
        function init(index, element) {
          setupIFrame(element, options);
        }

        return this.filter("iframe").each(init).end();
      };
    }
  }

  if (window.jQuery) {
    createJQueryPublicMethod(window.jQuery);
  }

  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && typeof module.exports === "object") {
    //Node for browserfy
    module.exports = factory();
  }
  window.iFrameResize = window.iFrameResize || factory();
})();

/**
 * Р’РёРґР¶РµС‚ РґР»СЏ С‚РµР»РµРјРµРґРёС†РёРЅС‹
 */
(function () {
  var iframe;
  var theme = "nornickel";
  var partnerCode = "3316";
  var origin = getScriptOrigin();
  var container;
  var minHeight;
  var getMaxHeight;

  window.telemedWidget = {
    init: function (containerSelector, authData, path, params) {
      params = params || {};

      containerSelector = containerSelector || ".tmk-container";
      theme = params.theme !== undefined ? params.theme : theme;
      partnerCode = params.partnerCode || partnerCode;
      origin = params.origin || origin;
      getMaxHeight =
        typeof params.getMaxHeight === "function"
          ? params.getMaxHeight
          : defaultGetMaxHeight;
      minHeight = params.minHeight || 300;

      findFrameContainer(containerSelector);
      setupMessagesProcessing();
      return authenticateAndRun(params, path, authData);
    },

    nav: function (where) {
      if (!where) {
        console.warn(
          "РќРµ РїРµСЂРµРґР°РЅ РјР°СЂС€СЂСѓС‚ РЅР°РІРёРіР°С†РёРё РІ РјРµС‚РѕРґ telemedWidget.nav"
        );
      }
      sendMessage("iframe-nav", where);
    },
  };

  function findFrameContainer(containerSelector) {
    container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(
        'РљРѕРЅС‚РµР№РЅРµСЂ "' + container + '" РЅРµ РЅР°Р№РґРµРЅ'
      );
    }
  }

  function setupMessagesProcessing() {
    window.addEventListener("message", function (evt) {
      processMessage(evt.data);
    });
  }

  function authenticateAndRun(params, path, authData) {
    var promise;

    if (authData) {
      promise = auth(authData).then(function (result) {
        if (result.success) {
          console.info(
            "Р РµР·СѓР»СЊС‚Р°С‚ Р°РІС‚РѕСЂРёР·Р°С†РёРё С‡РµСЂРµР· РІРёРґР¶РµС‚: " +
              JSON.stringify(result)
          );
          initFrame(params, path, result.token);
        }

        return result;
      });
    } else {
      initFrame(params, path);
      promise = Promise.resolve({ auth: false, success: true });
    }

    return promise;
  }

  function initFrame(params, path, token) {
    // РїСѓС‚СЊ Рє РїСЂРёР»РѕР¶РµРЅРёСЋ РїРµСЂРµРґР°РІР°С‚СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ, РёРЅР°С‡Рµ РЅРµ РїСЂРёРјРµС‚ С‚РѕРєРµРЅ
    var fullPath = `${origin}/${theme ? theme + "/" : ""}patient/${path || ""}`;
    // РїР°СЂР°РјРµС‚СЂС‹ РїСЂРёР»РѕР¶РµРЅРёСЏ РґР»СЏ РїРµСЂРµРґР°С‡Рё РІРѕ С„СЂРµР№Рј
    var urlParams = {
      log: params.log || "errors",
      authToken: token,
      patientProductId: params.patientProductId,
      utcOffset: params.utcOffset,
    };
    // СЃРєР»РµРёРІР°РµРј РЅРµРїСѓСЃС‚С‹Рµ РїР°СЂР°РјРµС‚СЂС‹ РІ РѕРґРЅСѓ СЃС‚СЂРѕРєСѓ
    var paramString = Object.keys(urlParams)
      .filter(function (key) {
        urlParams[key] !== undefined;
      })
      .map(function (key) {
        `${key}=${urlParams[key]}`;
      })
      .join("&");

    iframe = document.createElement("iframe");
    iframe.setAttribute("src", fullPath + "?" + paramString);
    iframe.setAttribute("allow", `microphone; camera; autoplay`);

    container.appendChild(iframe);

    window["iFrameResize"](
      {
        log: !!params.log,
        minHeight: minHeight,
        tolerance: 4,
        initCallback: function () {
          postHeight();
          window.addEventListener("resize", function () {
            postHeight();
          });
        },
      },
      iframe
    );
  }

  function auth(authData) {
    return fetch(`${origin}/api/partner/${partnerCode}/v2/authClient`, {
      method: "POST",
      headers: { "Content-type": "application/json" },
      body: JSON.stringify(authData),
    })
      .catch(function (err) {
        console.error(
          "РћС€РёР±РєР° РїСЂРё РІС‹Р·РѕРІРµ Р°РІС‚РѕСЂРёР·Р°С†РёРё"
        );
        console.error(err);
      })
      .then(function (response) {
        response && response.json();
      })
      .then(function (json) {
        if (json) {
          return {
            auth: true,
            success: json.code === "SUCCESS",
            code: json.code,
            message: json.message,
            token: json.token,
          };
        } else {
          showText("РџСЂРёР»РѕР¶РµРЅРёРµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ");
          return {
            auth: true,
            success: false,
          };
        }
      });
  }

  function processMessage(msg) {
    if (msg && msg.type === "iframe-request-scroll-position") {
      sendMessage("iframe-scroll-position", window.scrollY - iframe.offsetTop);
    }
  }

  function postHeight() {
    var maxHeight = getMaxHeight();
    maxHeight =
      typeof maxHeight === "number" && maxHeight > 0 ? maxHeight : 800;
    sendMessage("iframe-parent-resize", maxHeight);
  }

  function sendMessage(type, value) {
    if (iframe && origin) {
      iframe.contentWindow.postMessage({ type, value }, origin);
    } else {
      console.log(
        "РЎРёСЃС‚РµРјР° РѕС‚РїСЂР°РІРєРё СЃРѕРѕР±С‰РµРЅРёР№ РІРѕ С„СЂРµР№Рј РЅРµ РёРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°РЅР°. РћС‚РїСЂР°РІРєР° РЅРµРІРѕР·РјРѕР¶РЅР°"
      );
    }
  }

  function getScriptOrigin() {
    var script = document.currentScript
      ? document.currentScript
      : document.querySelector('script[src$="' + theme + "/widget.js" + '"]');
    var origin = 'https://test-telemed.drclinics.ru/nornickel/';
    console.log("Widget origin: " + origin);
    return origin;
  }

  function showText(msg) {
    var div = document.createElement("div");
    var textNode = document.createTextNode(msg);
    div.appendChild(textNode);
    container.appendChild(div);
  }

  function defaultGetMaxHeight() {
    return window.innerHeight - iframe.offsetTop;
  }
})();
