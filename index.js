"use strict";

const RANDOM_QUOTE_API_URL = "http://api.quotable.io/random";

(function() {
  const quoteDisplayElement = id('quote_display');
  const timerElement = id('timer');
  const LOWER_BOUND_RANDOM_INT = 10;
  const HIGHER_BOUND_RANDOM_INT = 16;

  // Game state variables
  let arrayQuote = [];
  let curIndex = 0;
  let valueWord = "";
  let can;
  let playerNumber;
  let gameJSON;

  // User data
  let playerId;
  let playerRef;

  // Login Process
  firebase.auth().signInAnonymously().catch((error)=> {
    let errorCode = error.code;
    let errorMessage = error.message;
    console.log(errorCode, errorMessage);
  });

  firebase.auth().onAuthStateChanged((user) => {
  console.log(user);
  if (user) {
    console.log("you're logged in");
    playerId = user.uid;

    // general process of how firebase setting fields works
    // let gameRef = firebase.database().ref(`Games/1`);
    // gameRef.set({
    //   game: "no"
    // })

  } else {
    console.log("you're NOT logged in");
    alert("NOT LOGGED IN, refresh page, weird bug right now");
  }
});

  /**
   * Add a function that will be called when the window is loaded.
   */
  window.addEventListener("load", init);

  // setup buttons
  function init() {
    qs("#menu-buttons button").addEventListener("click", startQueue);
    id("won-button").addEventListener("click", wonToMenu);
    id("lost-button").addEventListener("click", lostToMenu);
  }

  // switch to queue page and puts player in queue
  function startQueue() {
    menuToQueue();
    searchForGame();
  }

  /**
   * Puts player in the database and check the current status of possible game
   */
  function searchForGame() {
    // Puts player in the queue
    playerRef = firebase.database().ref(`Users/${playerId}`);
    playerRef.set({ uid: playerId });
    playerRef.onDisconnect().remove();  // removes when leaves

    // On users db update and sees if there valid amount of players to start
    let ref = firebase.database().ref("Users");
    let users;

    ref.on("value", (snap) => {
      users = snap.val();
      let userAmount = Object.keys(users).length;

      console.log(snap.val());
      console.log(userAmount);

      updateAmountQueue(userAmount);
      if (userAmount === 4) startGame(Object.keys(users));
    })
  }

  /**
   * Changes user amount to match the actual amount
   * @param {int} userAmount - user in queue amount
   */
  function updateAmountQueue(userAmount) {
    id("people-amount").textContent = userAmount;
  }

  /**
   * Initializes data base game logic per player then starts the match.
   * @param {Object[]} usersKeyArray - uid's of users (?)
   */
  function startGame(usersKeyArray) {
    // I think I wanted to remove the user's from the queue was being weird
    // since i needed the info later i think not sure.
    // setTimeout(function() {
    //   firebase.database().ref("Users").remove().catch(function(error){
    //     console.log("Remove failed: " + error.message)
    //   });
    // },1000);

    usersKeyArray.sort();

    // this logic is very sketchy but i seriously do not know any other way but it works.
    // there are X current players requests where the only difference is the quote.
    // so each client generates the quote and sends to the db, then goes off the last request's
    // quote to display to everyone. Sending 4 requests to only use one kinda seems bad practice
    let quote = getRandomQuote();

    gameJSON = {
      "players": usersKeyArray,
      "p1-progress": 0,
      "p2-progress": 0,
      "p3-progress": 0,
      "p4-progress": 0,
      "words": quote,
      "game-over": false
    };

    // need to change to have multiple games, but setup initial state
    let gameRef = firebase.database().ref(`Game/1`);
    gameRef.set(JSON.stringify(gameJSON));

    // Make sure everyone has the same up to date state.
    gameRef.on("value", (snap) => {
      gameJSON = snap.val();
      console.log(gameJSON);
    });

    // const time seems like it could be a problem.
    setTimeout(function() {
      startMatch(JSON.parse(gameJSON));
    }, 1500);
  }

  /**
   * Displays game state to the user and initializes associated elements.
   * @param {JSON} gameJSON - current game state for DB
   */
  function startMatch(gameJSON) {
    switchToGame();
    generateProgress(gameJSON);
    renderNewQuote(gameJSON.words);
    generateCanvas();
    startTimer();

    let gameRef = firebase.database().ref(`Game/1`);
    gameRef.on("value", (snap) => { updateCheck(JSON.parse(snap.val())); });
  }

  /**
   * Generates HTML elements associated with the gameJSON
   * @param {JSON} gameJSON - current game state for DB
   */
  function generateProgress(gameJSON) {
    let players = gameJSON.players;

    for (let i = 1; i <= 4; i++) { // const player count need to change later
      let div = gen("div");
      let pTag = gen("p");
      let progress = gen("progress");

      let pTagText;
      if (players[i - 1] === playerId) {
        pTagText = "You";
        playerNumber = i;
      } else {
        pTagText = "P" + i;
      }
      pTag.textContent = pTagText;
      progress.max = 100;
      progress.value = 0;
      progress.id = "p" + i;

      div.append(pTag);
      div.append(progress);
      id("progress-bars").append(div);
    }
  }

  /**
   * Updates the game display to data, and checks if any player completed the game and transition to
   * end.
   * @param {JSON} data - new gameJSON from firebase update
   */
  function updateCheck(data) {
    let progressOne = id("p1");
    let progressTwo = id("p2");
    let progressThree = id("p3");
    let progressFour = id("p4");

    progressOne.value = data["p1-progress"];
    progressTwo.value = data["p2-progress"];
    progressThree.value = data["p3-progress"];
    progressFour.value = data["p4-progress"];

    // checks if anyone completed the text. 99 is in case of flooring error since progress is determined by (current word position / total words); idk if it works tho lol
    if (progressOne.value === 100 || progressTwo.value === 100 || progressThree.value === 100 || progressFour.value === 100 ||
        progressOne.value === 99 || progressTwo.value === 99 || progressThree.value === 99 || progressFour.value === 99) {
      data["game-over"] = true;
      gameJSON = data;
      let gameRef = firebase.database().ref(`Game/1`);
      gameRef.set(JSON.stringify(gameJSON));
    }

    // Checks if this user won or lost.
    let winOrLose = (data["p" + playerNumber + "-progress"] === 100);

    if (data["game-over"]) {
      setTimeout(function() {
        endgame(winOrLose);
      }, 500);
    }
    gameJSON = data;
  }

  /**
   * Updates the player's progress and sends to the DB.
   * @param {int} amountDone - words done by player
   * @param {int} total - total words
   */
  function updateProgress(amountDone, total) {
    let tag = 'p'+playerNumber+'-progress';
    gameJSON[tag] = Math.floor((amountDone / total) * 100);

    let gameRef = firebase.database().ref(`Game/1`);
    gameRef.set(JSON.stringify(gameJSON));
  }

  /**
   * When the game ends (due to time or ending), this function transitions to endscreen and
   * cleans up the game state initial state DB-wise and client-wise.
   * @param {boolean} winOrLose - If the current client's player won or lost.
   */
  function endgame(winOrLose) {
    // transition user to end screen
    if (winOrLose) {
      gameToWon();
    } else {
      gameToLost();
    }

    // Clears game screen
    id("progress-bars").innerHTML = "";
    can = null;
    playerNumber = null;
    arrayQuote = [];
    curIndex = 0;
    valueWord = "";
    qs("#input-result p").textContent = "";
    id("canvas-section").innerHTML = "";
    id("user-button").innerHTML = "";

    // remove user to the DB and removes the game
    // I also do not remember why this is a timeout, does not seem necessary?
    setTimeout(function() {
      // same issue here, where one call is needed, but we ultimately called X player amount of calls
      // also scaling issue again
      firebase.database().ref("Users").remove().catch(function(error){
        console.log("Remove failed: " + error.message)
      });
      firebase.database().ref("Game/1").remove().catch(function(error){
        console.log("Remove failed: " + error.message)
      });
    }, 1000);
  }

  /**
   * Checks if the user's handwritten input matches the current word they are on and acts accordingly.
   */
  function checkInput() {
    console.log("changed");
    let correct = true;
    const arrayQuoteSpan = quoteDisplayElement.querySelectorAll('span');

    // valueWord is the current top word from the handwriting canvas.
    if (valueWord == null) {  // no word
      arrayQuoteSpan[curIndex].classList.remove('correct');
      arrayQuoteSpan[curIndex].classList.remove('incorrect');
      correct = false;
    } else if (arrayQuote[curIndex] === valueWord) {  // correct word
      arrayQuoteSpan[curIndex].classList.add('correct');
      arrayQuoteSpan[curIndex].classList.remove('incorrect');
      // correct word, moving onto next
      can.erase();
      clearDisplayText();
      curIndex++;
      updateProgress(curIndex, arrayQuoteSpan.length);
    } else {  // incorrect word
      arrayQuoteSpan[curIndex].classList.remove('correct');
      arrayQuoteSpan[curIndex].classList.add('incorrect');
      correct = false;
    }

  //  if(curIndex === arrayQuote.length && correct) renderNewQuote();
  }

  /**
   * Displays the generated quote from string to HTML elements, since we
   * need to have each word its own element to display progress.
   * @param {string} string - the full quote, each word is separated by space.
   */
  function renderNewQuote(string) {
    curIndex = 0;
    arrayQuote = [];
    const quote = string;
    quoteDisplayElement.innerHTML = '';
    quote.split(" ").forEach(word => {
      const wordSpan = gen('span');
      wordSpan.innerText = word + " ";
      quoteDisplayElement.appendChild(wordSpan);
      arrayQuote.push(word);
    });
  }

  /**
   * Setup and starts the timer. This is from stack overflow
   */
  let startTime;
  function startTimer() {
    timerElement.innerText = 92;
    startTime = new Date();
    let timerId = setInterval(() => {
      timer.innerText = 90 - getTimerTime();
      if(Number(timer.textContent) === 0) {
        clearInterval(timerId);
        gameJSON["game-over"] = true;
        let gameRef = firebase.database().ref(`Game/1`);
        gameRef.set(JSON.stringify(gameJSON));
      }
    }, 1000);
  }

  function getTimerTime() {
    return Math.floor((new Date() - startTime) / 1000);
  }

  /**
   * Generates and append the handwriting canvas HTML element, and its handwriting library
   * internal logic to work properly.
   */
  function generateCanvas() {
    let canvasElement = gen("canvas");
    canvasElement.id = "can";
    canvasElement.width = "900";
    canvasElement.height = "300";
    id("canvas-section").append(canvasElement);
    can = new handwriting.Canvas(id("can"));

    // When the can.recognize() is called and it sends an API request to Google Input Tools, and it
    // returns the JSON, setCallBack handles it.
    can.setCallBack(function(data) {
      updateUserInput(data, can);
    });

    can.setOptions(
      {
        language: "en",
        numOfReturn: 5
      }
    );

    ["click", "touchend"].forEach(function(e) {
      id("can").addEventListener(e,() => {
        can.recognize();
      });
    });

    let clear = gen("button");
    clear.id = "clear-button";
    clear.textContent = "clear";
    id("user-button").append(clear);

    id("clear-button").addEventListener("click", () => {
      can.erase();
      clearDisplayText();
    });
  }

  function clearDisplayText() {
    let element = qs("#input-result p");
    element.textContent = "";
  }

  // update userInput and updateTextBox can be merged into one

  function updateUserInput(data, can) {
    updateTextBox(data);
    //check answer
    console.log(data);
  }

  function updateTextBox(data) {
    let element = qs("#input-result p");
    let result = data[0].toLowerCase();
    element.textContent = result;
    valueWord = data[0].toLowerCase();
    checkInput();
  }

  /**
   * Generates a random string of words.
   * @returns {string} - words that are spaced separated.
   */
  function getRandomQuote() {
    // doing other languages would be cool and would be easier than i expect, i hope.
    // just switch statement to check the language set by user then change the
    // words.js to different languages

    let quote = "";
    let wordAmount = getRandomIntBetween(LOWER_BOUND_RANDOM_INT, HIGHER_BOUND_RANDOM_INT);

    for (let i = 0; i < wordAmount; i++) {
      let currentWord = words[getRandomIndex(words)].toLowerCase();
      quote += currentWord;
      if (i + 1 != wordAmount) quote += " ";
    }

    return quote;
  }

  function getRandomIntBetween(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
  }

  function getRandomIndex(array) {
    return Math.floor(Math.random()*array.length);
  }

  // TRANSITION/SWITCH screens functions

  function gameToLost() {
    id("won").classList.add("hidden");
    id("lost").classList.remove("hidden");
    id("game").classList.add("hidden");
  }

  function gameToWon() {
    id("lost").classList.add("hidden");
    id("won").classList.remove("hidden");
    id("game").classList.add("hidden");
  }

  function lostToMenu() {
    id("lost").classList.add("hidden");
    id("menu").classList.remove("hidden");
  }

  function wonToMenu() {
    id("won").classList.add("hidden");
    id("menu").classList.remove("hidden");
  }

  function switchToGame() {
    id("queue").classList.add("hidden");
    id("game").classList.remove("hidden");
  }

  function menuToQueue() {
    id("menu").classList.add("hidden");
    id("queue").classList.remove("hidden");
  }


  /** ------------------------------ Helper Functions  ------------------------------ */
  /**
   * Note: You may use these in your code, but remember that your code should not have
   * unused functions. Remove this comment in your own code.
   */

  /**
   * Returns the element that has the ID attribute with the specified value.
   * @param {string} idName - element ID
   * @returns {object} DOM object associated with id.
   */
  function id(idName) {
    return document.getElementById(idName);
  }

  /**
   * Returns the first element that matches the given CSS selector.
   * @param {string} selector - CSS query selector.
   * @returns {object} The first DOM object matching the query.
   */
  function qs(selector) {
    return document.querySelector(selector);
  }

  /**
   * Returns the array of elements that match the given CSS selector.
   * @param {string} selector - CSS query selector
   * @returns {object[]} array of DOM objects matching the query.
   */
  function qsa(selector) {
    return document.querySelectorAll(selector);
  }

  /**
   * Returns a new element with the given tag name.
   * @param {string} tagName - HTML tag name for new DOM element.
   * @returns {object} New DOM object for given HTML tag.
   */
  function gen(tagName) {
    return document.createElement(tagName);
  }

})();