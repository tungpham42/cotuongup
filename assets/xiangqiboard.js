/* @license
 * xiangqiboard.js v@VERSION
 * https://github.com/lengyanyu258/xiangqiboardjs/
 *
 * Copyright (c) 2017, Chris Oakman
 * Copyright (c) 2018-2020, @lengyanyu258
 * Released under the MIT license
 * https://github.com/lengyanyu258/xiangqiboardjs/blob/master/LICENSE.md
 */

// start anonymous scope
(function () {
  "use strict";

  const $ = window.jQuery;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const ROW_TOP = 9;
  const ROW_LOW = 0;
  const ROW_LENGTH = ROW_TOP - ROW_LOW + 1;
  const COLUMNS = Object.freeze("abcdefghi".split(""));
  const DEFAULT_DRAG_THROTTLE_RATE = 20;
  const ELLIPSIS = "...";
  const MINIMUM_JQUERY_VERSION = "1.8.3";
  const RUN_ASSERTS = true;
  const START_FEN =
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR";
  const START_POSITION = fenToObj(START_FEN);

  // default animation speeds
  const DEFAULT_APPEAR_SPEED = 200;
  const DEFAULT_MOVE_SPEED = 200;
  const DEFAULT_SNAPBACK_SPEED = 60;
  const DEFAULT_SNAP_SPEED = 30;
  const DEFAULT_TRASH_SPEED = 100;

  // use unique class names to prevent clashing with anything else on the page and simplify selectors
  // NOTE: these should never change
  const CSS = Object.freeze({
    clearfix: "clearfix-5f3b5",
    board: "board-1ef78",
    square: "square-2b8ce",
    highlight1: "highlight1-e13fc",
    highlight2: "highlight2-e0a03",
    notation: "notation-8c7a2",
    alpha: "alpha-f4ef2",
    numeric: "numeric-fe76e",
    row: "row-cb702",
    piece: "piece-1e8b9",
    sparePieces: "spare-pieces-9e77b",
    xiangqiboard: "xiangqiboard-8ddcb",
    sparePiecesTop: "spare-pieces-top-e4b47",
    sparePiecesBottom: "spare-pieces-bottom-29dac",
  });

  // ---------------------------------------------------------------------------
  // Misc Util Functions
  // ---------------------------------------------------------------------------

  function throttle(f, interval, scope) {
    let timeout = 0;
    let shouldFire = false;
    let args = [];

    const handleTimeout = function () {
      timeout = 0;
      if (shouldFire) {
        shouldFire = false;
        fire();
      }
    };

    const fire = function () {
      timeout = window.setTimeout(handleTimeout, interval);
      f.apply(scope, args);
    };

    return function (_args) {
      args = arguments;
      if (!timeout) {
        fire();
      } else {
        shouldFire = true;
      }
    };
  }

  function uuid() {
    return "xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx".replace(
      /x/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        return r.toString(16);
      },
    );
  }

  function deepCopy(thing) {
    return JSON.parse(JSON.stringify(thing));
  }

  function parseSemVer(version) {
    const tmp = version.split(".");
    return {
      major: parseInt(tmp[0], 10),
      minor: parseInt(tmp[1], 10),
      patch: parseInt(tmp[2], 10),
    };
  }

  // returns true if version is >= minimum
  function validSemanticVersion(version, minimum) {
    version = parseSemVer(version);
    minimum = parseSemVer(minimum);

    const versionNum =
      version.major * 100000 * 100000 + version.minor * 100000 + version.patch;
    const minimumNum =
      minimum.major * 100000 * 100000 + minimum.minor * 100000 + minimum.patch;

    return versionNum >= minimumNum;
  }

  function interpolateTemplate(str, obj) {
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      const keyTemplateStr = "{" + key + "}";
      const value = obj[key];
      while (str.indexOf(keyTemplateStr) !== -1) {
        str = str.replace(keyTemplateStr, value);
      }
    }
    return str;
  }

  // ---------------------------------------------------------------------------
  // Predicates
  // ---------------------------------------------------------------------------

  function isString(s) {
    return typeof s === "string";
  }

  function isFunction(f) {
    return typeof f === "function";
  }

  function isInteger(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
  }

  function validAnimationSpeed(speed) {
    if (speed === "fast" || speed === "slow") return true;
    if (!isInteger(speed)) return false;
    return speed >= 0;
  }

  function validThrottleRate(rate) {
    return isInteger(rate) && rate >= 1;
  }

  function validMove(move) {
    // move should be a string
    if (!isString(move)) return false;

    // move should be in the form of "e2-e4", "f6-d5"
    const squares = move.split("-");
    if (squares.length !== 2) return false;

    return validSquare(squares[0]) && validSquare(squares[1]);
  }

  function validSquare(square) {
    return isString(square) && square.search(/^[a-i][0-9]$/) !== -1;
  }

  function validPieceCode(code) {
    // UPDATED: Added 'X' to the regex to support Dark Xiangqi pieces
    return isString(code) && code.search(/^[br][KABNRCPX]$/) !== -1;
  }

  function validFen(fen) {
    if (!isString(fen)) return false;

    // cut off any move, castling, etc info from the end
    // we're only interested in position information
    fen = fen.replace(/ .+$/, "");

    // expand the empty square numbers to just 1s
    fen = expandFenEmptySquares(fen);

    // FEN should be ROW_LENGTH sections separated by slashes
    const chunks = fen.split("/");
    if (chunks.length !== ROW_LENGTH) return false;

    // check each section
    for (let i = 0; i < ROW_LENGTH; i++) {
      // UPDATED: Added 'x' and 'X' to the regex to support Dark Xiangqi pieces
      if (
        chunks[i].length !== COLUMNS.length ||
        chunks[i].search(/[^kabnrcpxKABNRCPX1]/) !== -1
      ) {
        return false;
      }
    }

    return true;
  }

  function validPositionObject(pos) {
    if (!$.isPlainObject(pos)) return false;

    for (const i in pos) {
      if (!pos.hasOwnProperty(i)) continue;

      if (!validSquare(i) || !validPieceCode(pos[i])) {
        return false;
      }
    }

    return true;
  }

  function isTouchDevice() {
    return "ontouchstart" in document.documentElement;
  }

  function validJQueryVersion() {
    return (
      typeof window.$ &&
      $.fn &&
      $.fn.jquery &&
      validSemanticVersion($.fn.jquery, MINIMUM_JQUERY_VERSION)
    );
  }

  // ---------------------------------------------------------------------------
  // Chess Util Functions
  // ---------------------------------------------------------------------------

  // convert FEN piece code to bP, rK, etc
  function fenToPieceCode(piece) {
    // black piece
    if (piece.toLowerCase() === piece) {
      return "b" + piece.toUpperCase();
    }

    // red piece
    return "r" + piece.toUpperCase();
  }

  // convert bP, rK, etc code to FEN structure
  function pieceCodeToFen(piece) {
    const pieceCodeLetters = piece.split("");

    // black piece
    if (pieceCodeLetters[0] === "b") {
      return pieceCodeLetters[1].toLowerCase();
    }

    // red piece
    return pieceCodeLetters[1].toUpperCase();
  }

  // convert FEN string to position object
  // returns false if the FEN string is invalid
  function fenToObj(fen) {
    if (!validFen(fen)) return false;

    // cut off any move, castling, etc info from the end
    // we're only interested in position information
    fen = fen.replace(/ .+$/, "");

    const rows = fen.split("/");
    const position = {};

    let currentRow = ROW_TOP;
    for (let i = 0; i < ROW_LENGTH; i++) {
      const row = rows[i].split("");
      let colIdx = 0;

      // loop through each character in the FEN section
      for (let j = 0; j < row.length; j++) {
        // number / empty squares
        if (row[j].search(/[1-9]/) !== -1) {
          const numEmptySquares = parseInt(row[j], 10);
          colIdx = colIdx + numEmptySquares;
        } else {
          // piece
          const square = COLUMNS[colIdx] + currentRow;
          position[square] = fenToPieceCode(row[j]);
          colIdx = colIdx + 1;
        }
      }

      currentRow = currentRow - 1;
    }

    return position;
  }

  // position object to FEN string
  // returns false if the obj is not a valid position object
  function objToFen(obj) {
    if (!validPositionObject(obj)) return false;

    let fen = "";

    let currentRow = ROW_TOP;
    for (let i = 0; i < ROW_LENGTH; i++) {
      for (let j = 0; j < COLUMNS.length; j++) {
        const square = COLUMNS[j] + currentRow;

        // piece exists
        if (obj.hasOwnProperty(square)) {
          fen = fen + pieceCodeToFen(obj[square]);
        } else {
          // empty space
          fen = fen + "1";
        }
      }

      if (i !== ROW_TOP) {
        fen = fen + "/";
      }

      currentRow = currentRow - 1;
    }

    // squeeze the empty numbers together
    fen = squeezeFenEmptySquares(fen);

    return fen;
  }

  function squeezeFenEmptySquares(fen) {
    return fen
      .replace(/111111111/g, "9")
      .replace(/11111111/g, "8")
      .replace(/1111111/g, "7")
      .replace(/111111/g, "6")
      .replace(/11111/g, "5")
      .replace(/1111/g, "4")
      .replace(/111/g, "3")
      .replace(/11/g, "2");
  }

  function expandFenEmptySquares(fen) {
    return fen
      .replace(/9/g, "111111111")
      .replace(/8/g, "11111111")
      .replace(/7/g, "1111111")
      .replace(/6/g, "111111")
      .replace(/5/g, "11111")
      .replace(/4/g, "1111")
      .replace(/3/g, "111")
      .replace(/2/g, "11");
  }

  // returns the distance between two squares
  function squareDistance(squareA, squareB) {
    const squareAArray = squareA.split("");
    const squareAx = COLUMNS.indexOf(squareAArray[0]) + 1;
    const squareAy = parseInt(squareAArray[1], 10);

    const squareBArray = squareB.split("");
    const squareBx = COLUMNS.indexOf(squareBArray[0]) + 1;
    const squareBy = parseInt(squareBArray[1], 10);

    const xDelta = Math.abs(squareAx - squareBx);
    const yDelta = Math.abs(squareAy - squareBy);

    if (xDelta >= yDelta) return xDelta;
    return yDelta;
  }

  // returns the square of the closest instance of piece
  // returns false if no instance of piece is found in position
  function findClosestPiece(position, piece, square) {
    // create array of closest squares from square
    const closestSquares = createRadius(square);

    // search through the position in order of distance for the piece
    for (let i = 0; i < closestSquares.length; i++) {
      const s = closestSquares[i];

      if (position.hasOwnProperty(s) && position[s] === piece) {
        return s;
      }
    }

    return false;
  }

  // returns an array of closest squares from square
  function createRadius(square) {
    const squares = [];

    // calculate distance of all squares
    for (let i = 0; i < COLUMNS.length; i++) {
      for (let j = 0; j < ROW_LENGTH; j++) {
        const s = COLUMNS[i] + j;

        // skip the square we're starting from
        if (square === s) continue;

        squares.push({
          square: s,
          distance: squareDistance(square, s),
        });
      }
    }

    // sort by distance
    squares.sort(function (a, b) {
      return a.distance - b.distance;
    });

    // just return the square code
    const surroundingSquares = [];
    for (let i = 0; i < squares.length; i++) {
      surroundingSquares.push(squares[i].square);
    }

    return surroundingSquares;
  }

  // given a position and a set of moves, return a new position
  // with the moves executed
  function calculatePositionFromMoves(position, moves) {
    const newPosition = deepCopy(position);

    for (const i in moves) {
      if (!moves.hasOwnProperty(i)) continue;

      // skip the move if the position doesn't have a piece on the source square
      if (!newPosition.hasOwnProperty(i)) continue;

      const piece = newPosition[i];
      delete newPosition[i];
      newPosition[moves[i]] = piece;
    }

    return newPosition;
  }

  // ---------------------------------------------------------------------------
  // HTML
  // ---------------------------------------------------------------------------

  function buildContainerHTML(hasSparePieces) {
    let html = '<div class="{xiangqiboard}">';

    if (hasSparePieces) {
      html += '<div class="{sparePieces} {sparePiecesTop}"></div>';
    }

    html += '<div class="{board}"></div>';

    if (hasSparePieces) {
      html += '<div class="{sparePieces} {sparePiecesBottom}"></div>';
    }

    html += "</div>";

    return interpolateTemplate(html, CSS);
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  function expandConfigArgumentShorthand(config) {
    if (config === "start") {
      config = { position: deepCopy(START_POSITION) };
    } else if (validFen(config)) {
      config = { position: fenToObj(config) };
    } else if (validPositionObject(config)) {
      config = { position: deepCopy(config) };
    }

    // config must be an object
    if (!$.isPlainObject(config)) config = {};

    return config;
  }

  // validate config / set default options
  function expandConfig(config) {
    // default for orientation is red
    if (config.orientation !== "black") config.orientation = "red";

    // default for showNotation is false
    if (config.showNotation !== true) config.showNotation = false;

    // default for draggable is false
    if (config.draggable !== true) config.draggable = false;

    // default for dropOffBoard is 'snapback'
    if (config.dropOffBoard !== "trash") config.dropOffBoard = "snapback";

    // default for sparePieces is false
    if (config.sparePieces !== true) config.sparePieces = false;

    // draggable must be true if sparePieces is enabled
    if (config.sparePieces) config.draggable = true;

    // default piece theme is wikimedia
    if (
      !config.hasOwnProperty("pieceTheme") ||
      (!isString(config.pieceTheme) && !isFunction(config.pieceTheme))
    ) {
      config.pieceTheme = "/assets/images/pieces/{piece}.svg";
    }

    // default board theme is wikimedia
    if (!config.hasOwnProperty("boardTheme") || !isString(config.boardTheme)) {
      config.boardTheme = "/assets/images/boards/ban-co.svg";
    }

    // animation speeds
    if (!validAnimationSpeed(config.appearSpeed))
      config.appearSpeed = DEFAULT_APPEAR_SPEED;
    if (!validAnimationSpeed(config.moveSpeed))
      config.moveSpeed = DEFAULT_MOVE_SPEED;
    if (!validAnimationSpeed(config.snapbackSpeed))
      config.snapbackSpeed = DEFAULT_SNAPBACK_SPEED;
    if (!validAnimationSpeed(config.snapSpeed))
      config.snapSpeed = DEFAULT_SNAP_SPEED;
    if (!validAnimationSpeed(config.trashSpeed))
      config.trashSpeed = DEFAULT_TRASH_SPEED;

    // throttle rate
    if (!validThrottleRate(config.dragThrottleRate))
      config.dragThrottleRate = DEFAULT_DRAG_THROTTLE_RATE;

    return config;
  }

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  // check for a compatible version of jQuery
  function checkJQuery() {
    if (!validJQueryVersion()) {
      const errorMsg =
        "Xiangqiboard Error 1005: Unable to find a valid version of jQuery. " +
        "Please include jQuery " +
        MINIMUM_JQUERY_VERSION +
        " or higher on the page" +
        "\n\n" +
        "Exiting" +
        ELLIPSIS;
      window.alert(errorMsg);
      return false;
    }

    return true;
  }

  // return either boolean false or the $container element
  function checkContainerArg(containerElOrString) {
    if (containerElOrString === "") {
      const errorMsg1 =
        "Xiangqiboard Error 1001: " +
        "The first argument to Xiangqiboard() cannot be an empty string." +
        "\n\n" +
        "Exiting" +
        ELLIPSIS;
      window.alert(errorMsg1);
      return false;
    }

    // convert containerEl to query selector if it is a string
    if (
      isString(containerElOrString) &&
      containerElOrString.charAt(0) !== "#"
    ) {
      containerElOrString = "#" + containerElOrString;
    }

    // containerEl must be something that becomes a jQuery collection of size 1
    const $container = $(containerElOrString);
    if ($container.length !== 1) {
      const errorMsg2 =
        "Xiangqiboard Error 1003: " +
        "The first argument to Xiangqiboard() must be the ID of a DOM node, " +
        "an ID query selector, or a single DOM node." +
        "\n\n" +
        "Exiting" +
        ELLIPSIS;
      window.alert(errorMsg2);
      return false;
    }

    return $container;
  }

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * @return {null}
   */
  function constructor(containerElOrString, config) {
    // first things first: check basic dependencies
    if (!checkJQuery()) {
      return null;
    }
    const $container = checkContainerArg(containerElOrString);
    if (!$container) {
      return null;
    }

    // ensure the config object is what we expect
    config = expandConfigArgumentShorthand(config);
    config = expandConfig(config);

    // DOM elements
    let $board = null;
    let $draggedPiece = null;
    let $sparePiecesTop = null;
    let $sparePiecesBottom = null;

    // constructor return object
    const widget = {};

    // -------------------------------------------------------------------------
    // Stateful
    // -------------------------------------------------------------------------

    let boardBorderSize = 2;
    let currentOrientation = "red";
    let currentPosition = {};
    let draggedPiece = null;
    let draggedPieceLocation = null;
    let draggedPieceSource = null;
    let isDragging = false;
    const sparePiecesElsIds = {};
    const squareElsIds = {};
    let squareElsOffsets = {};
    let squareSize = 16;

    // -------------------------------------------------------------------------
    // Validation / Errors
    // -------------------------------------------------------------------------

    function error(code, msg, obj) {
      // do nothing if showErrors is not set
      if (
        config.hasOwnProperty("showErrors") !== true ||
        config.showErrors === false
      ) {
        return;
      }

      let errorText = "Xiangqiboard Error " + code + ": " + msg;

      // print to console
      if (
        config.showErrors === "console" &&
        typeof console === "object" &&
        typeof console.log === "function"
      ) {
        console.log(errorText);
        if (arguments.length >= 2) {
          console.log(obj);
        }
        return;
      }

      // alert errors
      if (config.showErrors === "alert") {
        if (obj) {
          errorText += "\n\n" + JSON.stringify(obj);
        }
        window.alert(errorText);
        return;
      }

      // custom function
      if (isFunction(config.showErrors)) {
        config.showErrors(code, msg, obj);
      }
    }

    function setInitialState() {
      currentOrientation = config.orientation;

      // make sure position is valid
      if (config.hasOwnProperty("position")) {
        if (config.position === "start") {
          currentPosition = deepCopy(START_POSITION);
        } else if (validFen(config.position)) {
          currentPosition = fenToObj(config.position);
        } else if (validPositionObject(config.position)) {
          currentPosition = deepCopy(config.position);
        } else {
          error(
            7263,
            "Invalid value passed to config.position.",
            config.position,
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // DOM Misc
    // -------------------------------------------------------------------------

    // calculates square size based on the width of the container
    function calculateSquareSize() {
      const containerWidth = parseInt($container.width(), 10);

      if (!containerWidth || containerWidth <= 0) {
        return 0;
      }

      let boardWidth = containerWidth - 1;

      while (boardWidth % COLUMNS.length !== 0 && boardWidth > 0) {
        boardWidth = boardWidth - 1;
      }

      return boardWidth / COLUMNS.length;
    }

    function createElIds() {
      for (let i = 0; i < COLUMNS.length; i++) {
        for (let j = ROW_LOW; j <= ROW_TOP; j++) {
          const square = COLUMNS[i] + j;
          squareElsIds[square] = square + "-" + uuid();
        }
      }

      const pieces = "KABNRCPX".split(""); // Added 'X' here just in case sparePieces uses it
      for (let i = 0; i < pieces.length; i++) {
        const whitePiece = "r" + pieces[i];
        const blackPiece = "b" + pieces[i];
        sparePiecesElsIds[whitePiece] = whitePiece + "-" + uuid();
        sparePiecesElsIds[blackPiece] = blackPiece + "-" + uuid();
      }
    }

    // -------------------------------------------------------------------------
    // Markup Building
    // -------------------------------------------------------------------------

    function buildBoardHTML(orientation) {
      if (orientation !== "black") {
        orientation = "red";
      }

      let html = "";
      const alpha = deepCopy(COLUMNS);
      let row = ROW_TOP;
      if (orientation === "black") {
        alpha.reverse();
        row = ROW_LOW;
      }

      for (let i = 0; i < ROW_LENGTH; i++) {
        html += '<div class="{row}">';
        for (let j = 0; j < COLUMNS.length; j++) {
          const square = alpha[j] + row;

          html +=
            '<div class="{square} square-' +
            square +
            '" ' +
            'style="width:' +
            squareSize +
            "px;height:" +
            squareSize +
            'px;" ' +
            'id="' +
            squareElsIds[square] +
            '" ' +
            'data-square="' +
            square +
            '">';

          if (config.showNotation) {
            if (
              (orientation === "red" && row === ROW_LOW) ||
              (orientation === "black" && row === ROW_TOP)
            ) {
              html += '<div class="{notation} {alpha}">' + alpha[j] + "</div>";
            }

            if (j === 0) {
              html += '<div class="{notation} {numeric}">' + row + "</div>";
            }
          }

          html += "</div>";
        }
        html += '<div class="{clearfix}"></div></div>';

        if (orientation === "red") {
          row = row - 1;
        } else {
          row = row + 1;
        }
      }

      return interpolateTemplate(html, CSS);
    }

    function buildBoardCSS(orientation) {
      if (orientation !== "black") {
        orientation = "red";
      }

      const css = {};
      css.background = 'url("' + config.boardTheme + '") no-repeat';
      css["background-size"] = "100%";
      return css;
    }

    function buildPieceImgSrc(piece) {
      if (isFunction(config.pieceTheme)) {
        return config.pieceTheme(piece);
      }
      return interpolateTemplate(config.pieceTheme, { piece: piece });
    }

    function buildPieceHTML(piece, hidden, id) {
      let html = '<img src="' + buildPieceImgSrc(piece) + '" ';
      if (isString(id) && id !== "") {
        html += 'id="' + id + '" ';
      }
      html +=
        'alt="" ' +
        'class="{piece}" ' +
        'data-piece="' +
        piece +
        '" ' +
        'style="width:' +
        squareSize +
        "px;" +
        "height:" +
        squareSize +
        "px;";

      if (hidden) {
        html += "display:none;";
      }

      html += '" />';

      return interpolateTemplate(html, CSS);
    }

    function buildSparePiecesHTML(color) {
      let pieces = ["rK", "rA", "rB", "rN", "rR", "rC", "rP"];
      if (color === "black") {
        pieces = ["bK", "bA", "bB", "bN", "bR", "bC", "bP"];
      }

      let html = "";
      for (let i = 0; i < pieces.length; i++) {
        html += buildPieceHTML(pieces[i], false, sparePiecesElsIds[pieces[i]]);
      }

      return html;
    }

    // -------------------------------------------------------------------------
    // Animations
    // -------------------------------------------------------------------------

    function animateSquareToSquare(src, dest, piece, completeFn) {
      const $srcSquare = $("#" + squareElsIds[src]);
      const srcSquarePosition = $srcSquare.offset();
      const $destSquare = $("#" + squareElsIds[dest]);
      const destSquarePosition = $destSquare.offset();

      const animatedPieceId = uuid();
      $("body").append(buildPieceHTML(piece, true, animatedPieceId));
      const $animatedPiece = $("#" + animatedPieceId);
      $animatedPiece.css({
        display: "",
        position: "absolute",
        top: srcSquarePosition.top,
        left: srcSquarePosition.left,
      });

      $srcSquare.find("." + CSS.piece).remove();

      function onFinishAnimation1() {
        $destSquare.append(buildPieceHTML(piece));
        $animatedPiece.remove();
        if (isFunction(completeFn)) {
          completeFn();
        }
      }

      const opts = {
        duration: config.moveSpeed,
        complete: onFinishAnimation1,
      };
      $animatedPiece.animate(destSquarePosition, opts);
    }

    function animateSparePieceToSquare(piece, dest, completeFn) {
      const srcOffset = $("#" + sparePiecesElsIds[piece]).offset();
      const $destSquare = $("#" + squareElsIds[dest]);
      const destOffset = $destSquare.offset();

      const pieceId = uuid();
      $("body").append(buildPieceHTML(piece, true, pieceId));
      const $animatedPiece = $("#" + pieceId);
      $animatedPiece.css({
        display: "",
        position: "absolute",
        left: srcOffset.left,
        top: srcOffset.top,
      });

      function onFinishAnimation2() {
        $destSquare.find("." + CSS.piece).remove();
        $destSquare.append(buildPieceHTML(piece));
        $animatedPiece.remove();
        if (isFunction(completeFn)) {
          completeFn();
        }
      }

      const opts = {
        duration: config.moveSpeed,
        complete: onFinishAnimation2,
      };
      $animatedPiece.animate(destOffset, opts);
    }

    function doAnimations(animations, oldPos, newPos) {
      if (animations.length === 0) return;

      let numFinished = 0;

      function onFinishAnimation3() {
        numFinished = numFinished + 1;
        if (numFinished !== animations.length) return;

        drawPositionInstant();

        if (isFunction(config.onMoveEnd)) {
          config.onMoveEnd(deepCopy(oldPos), deepCopy(newPos));
        }
      }

      for (let i = 0; i < animations.length; i++) {
        const animation = animations[i];

        if (animation.type === "clear") {
          $("#" + squareElsIds[animation.square] + " ." + CSS.piece).fadeOut(
            config.trashSpeed,
            onFinishAnimation3,
          );
        } else if (animation.type === "add" && !config.sparePieces) {
          $("#" + squareElsIds[animation.square])
            .append(buildPieceHTML(animation.piece, true))
            .find("." + CSS.piece)
            .fadeIn(config.appearSpeed, onFinishAnimation3);
        } else if (animation.type === "add" && config.sparePieces) {
          animateSparePieceToSquare(
            animation.piece,
            animation.square,
            onFinishAnimation3,
          );
        } else if (animation.type === "move") {
          animateSquareToSquare(
            animation.source,
            animation.destination,
            animation.piece,
            onFinishAnimation3,
          );
        }
      }
    }

    function calculateAnimations(pos1, pos2) {
      pos1 = deepCopy(pos1);
      pos2 = deepCopy(pos2);

      const animations = [];
      const squaresMovedTo = {};

      for (const i in pos2) {
        if (!pos2.hasOwnProperty(i)) continue;

        if (pos1.hasOwnProperty(i) && pos1[i] === pos2[i]) {
          delete pos1[i];
          delete pos2[i];
        }
      }

      for (const i in pos2) {
        if (!pos2.hasOwnProperty(i)) continue;

        const closestPiece = findClosestPiece(pos1, pos2[i], i);
        if (closestPiece) {
          animations.push({
            type: "move",
            source: closestPiece,
            destination: i,
            piece: pos2[i],
          });

          delete pos1[closestPiece];
          delete pos2[i];
          squaresMovedTo[i] = true;
        }
      }

      for (const i in pos2) {
        if (!pos2.hasOwnProperty(i)) continue;

        animations.push({
          type: "add",
          square: i,
          piece: pos2[i],
        });

        delete pos2[i];
      }

      for (const i in pos1) {
        if (!pos1.hasOwnProperty(i)) continue;

        if (squaresMovedTo.hasOwnProperty(i)) continue;

        animations.push({
          type: "clear",
          square: i,
          piece: pos1[i],
        });

        delete pos1[i];
      }

      return animations;
    }

    // -------------------------------------------------------------------------
    // Control Flow
    // -------------------------------------------------------------------------

    function drawPositionInstant() {
      $board.find("." + CSS.piece).remove();

      for (const i in currentPosition) {
        if (!currentPosition.hasOwnProperty(i)) continue;

        $("#" + squareElsIds[i]).append(buildPieceHTML(currentPosition[i]));
      }
    }

    function drawBoard() {
      $board.html(
        buildBoardHTML(currentOrientation, squareSize, config.showNotation),
      );
      $board.css(buildBoardCSS(currentOrientation));
      drawPositionInstant();

      if (config.sparePieces) {
        if (currentOrientation === "black") {
          $sparePiecesTop.html(buildSparePiecesHTML("red"));
          $sparePiecesBottom.html(buildSparePiecesHTML("black"));
        } else {
          $sparePiecesTop.html(buildSparePiecesHTML("black"));
          $sparePiecesBottom.html(buildSparePiecesHTML("red"));
        }
      }
    }

    function setCurrentPosition(position) {
      const oldPos = deepCopy(currentPosition);
      const newPos = deepCopy(position);
      const oldFen = objToFen(oldPos);
      const newFen = objToFen(newPos);

      if (oldFen === newFen) return;

      if (isFunction(config.onChange)) {
        config.onChange(oldPos, newPos);
      }

      currentPosition = position;
    }

    function isXYOnSquare(x, y) {
      for (const i in squareElsOffsets) {
        if (!squareElsOffsets.hasOwnProperty(i)) continue;

        const s = squareElsOffsets[i];
        if (
          x >= s.left &&
          x < s.left + squareSize &&
          y >= s.top &&
          y < s.top + squareSize
        ) {
          return i;
        }
      }

      return "offboard";
    }

    function captureSquareOffsets() {
      squareElsOffsets = {};

      for (const i in squareElsIds) {
        if (!squareElsIds.hasOwnProperty(i)) continue;

        squareElsOffsets[i] = $("#" + squareElsIds[i]).offset();
      }
    }

    function removeSquareHighlights() {
      $board
        .find("." + CSS.square)
        .removeClass(CSS.highlight1 + " " + CSS.highlight2);
    }

    function snapbackDraggedPiece() {
      if (draggedPieceSource === "spare") {
        trashDraggedPiece();
        return;
      }

      removeSquareHighlights();

      function complete() {
        drawPositionInstant();
        $draggedPiece.css("display", "none");

        if (isFunction(config.onSnapbackEnd)) {
          config.onSnapbackEnd(
            draggedPiece,
            draggedPieceSource,
            deepCopy(currentPosition),
            currentOrientation,
          );
        }
      }

      const sourceSquarePosition = $(
        "#" + squareElsIds[draggedPieceSource],
      ).offset();

      const opts = {
        duration: config.snapbackSpeed,
        complete: complete,
      };
      $draggedPiece.animate(sourceSquarePosition, opts);

      isDragging = false;
    }

    function trashDraggedPiece() {
      removeSquareHighlights();

      const newPosition = deepCopy(currentPosition);
      delete newPosition[draggedPieceSource];
      setCurrentPosition(newPosition);

      drawPositionInstant();
      $draggedPiece.fadeOut(config.trashSpeed);
      isDragging = false;
    }

    function dropDraggedPieceOnSquare(square) {
      removeSquareHighlights();

      const newPosition = deepCopy(currentPosition);
      delete newPosition[draggedPieceSource];
      newPosition[square] = draggedPiece;
      setCurrentPosition(newPosition);

      const targetSquarePosition = $("#" + squareElsIds[square]).offset();

      function onAnimationComplete() {
        drawPositionInstant();
        $draggedPiece.css("display", "none");

        if (isFunction(config.onSnapEnd)) {
          config.onSnapEnd(draggedPieceSource, square, draggedPiece);
        }
      }

      const opts = {
        duration: config.snapSpeed,
        complete: onAnimationComplete,
      };
      $draggedPiece.animate(targetSquarePosition, opts);

      isDragging = false;
    }

    function beginDraggingPiece(source, piece, x, y) {
      if (
        isFunction(config.onDragStart) &&
        config.onDragStart(
          source,
          piece,
          deepCopy(currentPosition),
          currentOrientation,
        ) === false
      ) {
        return;
      }

      isDragging = true;
      draggedPiece = piece;
      draggedPieceSource = source;

      if (source === "spare") {
        draggedPieceLocation = "offboard";
      } else {
        draggedPieceLocation = source;
      }

      captureSquareOffsets();

      $draggedPiece.attr("src", buildPieceImgSrc(piece)).css({
        display: "",
        position: "absolute",
        left: x - squareSize / 2,
        top: y - squareSize / 2,
      });

      if (source !== "spare") {
        $("#" + squareElsIds[source])
          .addClass(CSS.highlight1)
          .find("." + CSS.piece)
          .css("display", "none");
      }
    }

    function updateDraggedPiece(x, y) {
      $draggedPiece.css({
        left: x - squareSize / 2,
        top: y - squareSize / 2,
      });

      const location = isXYOnSquare(x, y);

      if (location === draggedPieceLocation) return;

      if (validSquare(draggedPieceLocation)) {
        $("#" + squareElsIds[draggedPieceLocation]).removeClass(CSS.highlight2);
      }

      if (validSquare(location)) {
        $("#" + squareElsIds[location]).addClass(CSS.highlight2);
      }

      if (isFunction(config.onDragMove)) {
        config.onDragMove(
          location,
          draggedPieceLocation,
          draggedPieceSource,
          draggedPiece,
          deepCopy(currentPosition),
          currentOrientation,
        );
      }

      draggedPieceLocation = location;
    }

    function stopDraggedPiece(location) {
      let action = "drop";
      if (location === "offboard" && config.dropOffBoard === "snapback") {
        action = "snapback";
      }
      if (location === "offboard" && config.dropOffBoard === "trash") {
        action = "trash";
      }

      if (isFunction(config.onDrop)) {
        const newPosition = deepCopy(currentPosition);

        if (draggedPieceSource === "spare" && validSquare(location)) {
          newPosition[location] = draggedPiece;
        }

        if (validSquare(draggedPieceSource) && location === "offboard") {
          delete newPosition[draggedPieceSource];
        }

        if (validSquare(draggedPieceSource) && validSquare(location)) {
          delete newPosition[draggedPieceSource];
          newPosition[location] = draggedPiece;
        }

        const oldPosition = deepCopy(currentPosition);

        const result = config.onDrop(
          draggedPieceSource,
          location,
          draggedPiece,
          newPosition,
          oldPosition,
          currentOrientation,
        );
        if (result === "snapback" || result === "trash") {
          action = result;
        }
      }

      if (action === "snapback") {
        snapbackDraggedPiece();
      } else if (action === "trash") {
        trashDraggedPiece();
      } else if (action === "drop") {
        dropDraggedPieceOnSquare(location);
      }
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    widget.clear = function (useAnimation) {
      widget.position({}, useAnimation);
    };

    widget.destroy = function () {
      $container.html("");
      $draggedPiece.remove();
      $container.unbind();
    };

    widget.fen = function () {
      return widget.position("fen");
    };

    widget.flip = function () {
      return widget.orientation("flip");
    };

    widget.move = function () {
      if (arguments.length === 0) return currentPosition;

      let useAnimation = true;
      const moves = {};
      for (let i = 0; i < arguments.length; i++) {
        if (arguments[i] === false) {
          useAnimation = false;
          continue;
        }

        if (!validMove(arguments[i])) {
          error(2826, "Invalid move passed to the move method.", arguments[i]);
          continue;
        }

        const tmp = arguments[i].split("-");
        moves[tmp[0]] = tmp[1];
      }

      const newPos = calculatePositionFromMoves(currentPosition, moves);
      widget.position(newPos, useAnimation);
      return newPos;
    };

    widget.orientation = function (arg) {
      if (arguments.length === 0) {
        return currentOrientation;
      }

      if (arg === "flip") {
        currentOrientation = currentOrientation === "black" ? "red" : "black";
      } else {
        if (arg !== "black") {
          currentOrientation = "red";
        } else {
          currentOrientation = arg;
        }
      }

      drawBoard();
      return currentOrientation;
    };

    widget.position = function (position, useAnimation) {
      if (arguments.length === 0) {
        return deepCopy(currentPosition);
      }

      if (isString(position) && position.toLowerCase() === "fen") {
        return objToFen(currentPosition);
      }

      if (isString(position) && position.toLowerCase() === "start") {
        position = deepCopy(START_POSITION);
      }

      if (validFen(position)) {
        position = fenToObj(position);
      }

      if (!validPositionObject(position)) {
        error(6482, "Invalid value passed to the position method.", position);
        return;
      }

      if (useAnimation !== false) useAnimation = true;

      if (useAnimation) {
        const animations = calculateAnimations(currentPosition, position);
        doAnimations(animations, currentPosition, position);
        setCurrentPosition(position);
      } else {
        setCurrentPosition(position);
        drawPositionInstant();
      }
    };

    widget.resize = function () {
      squareSize = calculateSquareSize();
      $board.css("width", squareSize * COLUMNS.length + "px");

      $draggedPiece.css({
        height: squareSize,
        width: squareSize,
      });

      if (config.sparePieces) {
        $container
          .find("." + CSS.sparePieces)
          .css("paddingLeft", squareSize + boardBorderSize + "px");
      }

      drawBoard();
    };

    widget.start = function (useAnimation) {
      widget.position("start", useAnimation);
    };

    // -------------------------------------------------------------------------
    // Browser Events
    // -------------------------------------------------------------------------

    function stopDefault(evt) {
      evt.preventDefault();
    }

    function mousedownSquare(evt) {
      if (!config.draggable) return;

      const square = $(this).attr("data-square");
      if (!validSquare(square)) return;
      if (!currentPosition.hasOwnProperty(square)) return;

      beginDraggingPiece(square, currentPosition[square], evt.pageX, evt.pageY);
    }

    function touchstartSquare(e) {
      if (!config.draggable) return;

      const square = $(this).attr("data-square");
      if (!validSquare(square)) return;
      if (!currentPosition.hasOwnProperty(square)) return;

      e = e.originalEvent;
      beginDraggingPiece(
        square,
        currentPosition[square],
        e.changedTouches[0].pageX,
        e.changedTouches[0].pageY,
      );
    }

    function mousedownSparePiece(evt) {
      if (!config.sparePieces) return;

      const piece = $(this).attr("data-piece");
      beginDraggingPiece("spare", piece, evt.pageX, evt.pageY);
    }

    function touchstartSparePiece(e) {
      if (!config.sparePieces) return;

      const piece = $(this).attr("data-piece");
      e = e.originalEvent;
      beginDraggingPiece(
        "spare",
        piece,
        e.changedTouches[0].pageX,
        e.changedTouches[0].pageY,
      );
    }

    function mousemoveWindow(evt) {
      if (isDragging) {
        updateDraggedPiece(evt.pageX, evt.pageY);
      }
    }

    const throttledMousemoveWindow = throttle(
      mousemoveWindow,
      config.dragThrottleRate,
    );

    function touchmoveWindow(evt) {
      if (!isDragging) return;
      evt.preventDefault();

      updateDraggedPiece(
        evt.originalEvent.changedTouches[0].pageX,
        evt.originalEvent.changedTouches[0].pageY,
      );
    }

    const throttledTouchmoveWindow = throttle(
      touchmoveWindow,
      config.dragThrottleRate,
    );

    function mouseupWindow(evt) {
      if (!isDragging) return;

      const location = isXYOnSquare(evt.pageX, evt.pageY);
      stopDraggedPiece(location);
    }

    function touchendWindow(evt) {
      if (!isDragging) return;

      const location = isXYOnSquare(
        evt.originalEvent.changedTouches[0].pageX,
        evt.originalEvent.changedTouches[0].pageY,
      );

      stopDraggedPiece(location);
    }

    function mouseenterSquare(evt) {
      if (isDragging) return;
      if (!isFunction(config.onMouseoverSquare)) return;

      const square = $(evt.currentTarget).attr("data-square");
      if (!validSquare(square)) return;

      let piece = false;
      if (currentPosition.hasOwnProperty(square)) {
        piece = currentPosition[square];
      }

      config.onMouseoverSquare(
        square,
        piece,
        deepCopy(currentPosition),
        currentOrientation,
      );
    }

    function mouseleaveSquare(evt) {
      if (isDragging) return;
      if (!isFunction(config.onMouseoutSquare)) return;

      const square = $(evt.currentTarget).attr("data-square");
      if (!validSquare(square)) return;

      let piece = false;
      if (currentPosition.hasOwnProperty(square)) {
        piece = currentPosition[square];
      }

      config.onMouseoutSquare(
        square,
        piece,
        deepCopy(currentPosition),
        currentOrientation,
      );
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    function addEvents() {
      $("body").on("mousedown mousemove", "." + CSS.piece, stopDefault);

      $board.on("mousedown", "." + CSS.square, mousedownSquare);
      $container.on(
        "mousedown",
        "." + CSS.sparePieces + " ." + CSS.piece,
        mousedownSparePiece,
      );

      $board
        .on("mouseenter", "." + CSS.square, mouseenterSquare)
        .on("mouseleave", "." + CSS.square, mouseleaveSquare);

      const $window = $(window);
      $window
        .on("mousemove", throttledMousemoveWindow)
        .on("mouseup", mouseupWindow);

      if (isTouchDevice()) {
        $board.on("touchstart", "." + CSS.square, touchstartSquare);
        $container.on(
          "touchstart",
          "." + CSS.sparePieces + " ." + CSS.piece,
          touchstartSparePiece,
        );
        $window
          .on("touchmove", throttledTouchmoveWindow)
          .on("touchend", touchendWindow);
      }
    }

    function initDOM() {
      createElIds();

      $container.html(buildContainerHTML(config.sparePieces));
      $board = $container.find("." + CSS.board);

      if (config.sparePieces) {
        $sparePiecesTop = $container.find("." + CSS.sparePiecesTop);
        $sparePiecesBottom = $container.find("." + CSS.sparePiecesBottom);
      }

      const draggedPieceId = uuid();
      $("body").append(buildPieceHTML("rP", true, draggedPieceId));
      $draggedPiece = $("#" + draggedPieceId);

      boardBorderSize = parseInt($board.css("borderLeftWidth"), 10);
      widget.resize();
    }

    setInitialState();
    initDOM();
    addEvents();

    return widget;
  } // end constructor

  window.Xiangqiboard = constructor;
  window.Xiangqiboard.fenToObj = fenToObj;
  window.Xiangqiboard.objToFen = objToFen;
})();

if (typeof exports !== "undefined") {
  exports.Xiangqiboard = window.Xiangqiboard;
}
