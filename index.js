const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const pool = require("./db");
const cards = require("./cards");
const names = require("./names");
const path = require("path");
const axios = require("axios");
const bot = require("./telegram");
const cheerio = require("cheerio");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// app.use(cors());
app.use(
  cors({
    origin: "*", // allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false, // with '*' you cannot use credentials
  })
);
app.use(express.json());

app.use("/api", require("./routes/auth"));
app.use("/api/general", require("./routes/general"));
app.use("/audio", express.static(path.join(process.cwd(), "audio")));

let games = {
  10: {
    value: 10,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: true,
    npc_count: 2,
    npc_added: 0,
    npc_lines: [],
    consecutive_games: 0,
  },
  20: {
    value: 20,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: true,
    npc_count: 5,
    npc_added: 0,
    npc_lines: [],
    consecutive_games: 0,
  },
  30: {
    value: 30,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: true,
    npc_count: 5,
    npc_added: 0,
    npc_lines: [],
    consecutive_games: 0,
  },
  50: {
    value: 50,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: false,
    npc_count: 4,
    npc_added: 0,
    npc_lines: [],
  },
  80: {
    value: 80,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: true,
    npc_count: 5,
    npc_added: 0,
    npc_lines: [],
    consecutive_games: 0,
  },
  100: {
    value: 100,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: false,
    npc_count: 4,
    npc_added: 0,
    npc_lines: [],
  },
  150: {
    value: 150,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: false,
    npc_count: 4,
    npc_added: 0,
    npc_lines: [],
  },
  200: {
    value: 200,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: false,
    npc_count: 4,
    npc_added: 0,
    npc_lines: [],
  },
  300: {
    value: 300,
    players: [],
    active: false,
    numbers: [],
    drawn_numbers: [],
    count: 15,
    interval: null,
    call_interval: null,
    counter: 0,
    pending: false,
    current_number: null,
    winners: [],
    last_number_called_at: Date.now(),
    grace_timeout: null,
    npc: false,
    npc_count: 4,
    npc_added: 0,
    npc_lines: [],
  },
};
const userSockets = {};
io.on("connection", (socket) => {
  // console.log("Client connected");

  socket.emit("games", remove_interval_from_games());

  //Intialize username
  socket.on("set_username", (username) => {
    socket.username = username;
    // console.log("USername", username);
  });

  //Refresh game list in home
  socket.on("refresh_game_list", () => {
    socket.emit("games", remove_interval_from_games());
  });

  // Game rooms join
  socket.on("join_room", (room_id, username, g) => {
    // console.log("Joined", room_id, username, g);

    socket.room_id = room_id;
    socket.username = username;

    // Store mapping
    userSockets[username] = socket.id;

    socket.join(room_id);

    // console.log("Game ", g);
    if (g) {
      const index = games[g].players.findIndex((p) => p.user_id === username);
      // console.log("Found user: ", index);
      if (index !== -1) {
        socket.emit("cartela_number", JSON.stringify(games[g].players[index]));
      } else {
        socket.emit("back_to_home");
      }
    }
  });

  // If user leaves after selecting cartela(with in app)
  socket.on("remove_user_from_game", (g, u) => {
    remove_user_from_players_list(g, u);
    socket.leave(`game_${g}`);
  });

  socket.on("cartela_selected", async (n, g, u) => {
    const players = games[g].players;
    const game_value = games[g].value;

    if (games[g].active) {
      return;
    }

    // console.log(":username:", u, n, g);
    try {
      const res = await axios.get(
        "http://localhost:5000/api/general/get_balance",
        {
          params: { phone: u },
        }
      );

      if (res.data.status) {
        if (g > parseInt(res.data.balance + res.data.bonus)) {
          return;
        }
      }
    } catch (err) {
      return;
    }

    const indexUser = players.findIndex((p) => p.user_id === u);
    const indexNumber = players.findIndex((p) =>
      Array.isArray(p.cartela_number) ? p.cartela_number.includes(n) : false
    );

    // Remove user if selecting same single number again (legacy case)

    // console.log(
    //   indexUser,
    //   games[g]

    //   // Array.isArray(players[indexUser].cartela_number),
    //   // players[indexUser].cartela_number.length === 1,
    //   // players[indexUser].cartela_number[0] === n
    // );

    if (
      indexUser !== -1 &&
      Array.isArray(players[indexUser].cartela_number) &&
      players[indexUser].cartela_number.length === 1 &&
      players[indexUser].cartela_number[0] === n
    ) {
      games[g].players = players.filter((p) => p.user_id !== u);
      const { interval, grace_timeout, ...cleanGame } = games[g];
      // io.to(`game_${g}`).emit(
      //   `selected_card_respose_${g}`,
      //   JSON.stringify(cleanGame)
      // );
      // console.log("Game", g, games[g]);
      io.emit(`selected_card_respose_${g}`, JSON.stringify(cleanGame));
      return;
    }

    // Prevent picking number already picked by someone else
    if (indexNumber !== -1 && players[indexNumber].user_id !== u) {
      return;
    }

    let canSelectTwo = false;

    // Fetch user's balance + bonus from DB
    const [rows] = await pool.query(
      "SELECT balance, bonus FROM users WHERE phone = ?",
      [u]
    );

    if (rows.length > 0) {
      const { balance, bonus } = rows[0];
      if (balance + bonus >= 2 * game_value) {
        canSelectTwo = false;
      }
    }

    if (indexUser !== -1) {
      const cartela = players[indexUser].cartela_number || [];

      if (cartela.includes(n)) {
        // If already selected, remove
        players[indexUser].cartela_number = cartela.filter((num) => num !== n);
      } else {
        // Add with check
        if (cartela.length < (canSelectTwo ? 2 : 1)) {
          cartela.push(n);
        } else {
          // Replace if at max
          cartela.shift();
          cartela.push(n);
        }
        // console.log(players, "LL");
        players[indexUser].cartela_number = cartela;
      }

      players[indexUser].is_active = false;
    } else {
      players.push({
        user_id: u,
        cartela_number: [n],
        is_active: false,
      });
      // console.log(players);
    }

    const { interval, grace_timeout, ...cleanGame } = games[g];
    io.to(`game_${g}`).emit(
      `selected_card_respose_${g}`,
      JSON.stringify(cleanGame)
    );
    // io.emit(`selected_card_respose_10`, JSON.stringify(cleanGame));
  });

  // returning from cartela to home
  socket.on("cartela_to_home", (u, g) => {
    // console.log("Received");
    remove_user_from_players_list(g, u);
  });

  // Starting game
  socket.on("entering_game", (g, u) => {
    const players = games[g].players;

    const index = players.findIndex((p) => p.user_id === u);
    if (index !== -1) {
      players[index].is_active = true;
      // console.log("success");
    }
  });

  socket.on("go_back", (g, u) => {
    if (!games[g].active) {
      games[g].players = games[g].players.filter((p) => p.user_id !== u);
      const { interval, grace_timeout, ...cleanGame } = games[g];
      io.to(`game_${g}`).emit(`go_back_${g}`, JSON.stringify(cleanGame));
      // console.log("Game", g, games[g]);
      // io.emit(`selected_card_respose_${g}`, JSON.stringify(cleanGame));
      return;
    }
  });

  // Exit game from game to home
  socket.on("exit_game", (g, u) => {
    const index = games[g].players.findIndex((p) => p.user_id === u);

    if (index !== -1) {
      if (!games[g].active) {
        games[g].players = games[g].players.filter((p) => p.user_id !== u);
      }
    }
  });

  // Bingo
  socket.on("bingo", async (g, c, u) => {
    const now = Date.now();
    const time_passed = now - games[g].last_number_called_at;
    const time_left = 4000 - time_passed;

    games[g].winners.push({
      u,
      c,
    });

    if (games[g].grace_timeout) return;

    games[g].grace_timeout = setTimeout(async () => {
      clearInterval(games[g].call_interval);

      const active_players = games[g].players.filter(
        (p) => p.is_active && Array.isArray(p.cartela_number)
      );

      const npcPlayers = games[g].players.filter(
        (p) =>
          p.is_active && Array.isArray(p.cartela_number) && p.user_id === "npc"
      );

      const totalCartelaCount = active_players.reduce(
        (sum, p) => sum + p.cartela_number.length,
        0
      );

      const win_amount = win_amount_calculator(g, totalCartelaCount);

      const winner_user_ids = games[g].winners;

      const last_game_id = await get_last_game_id(g);

      const uu = games[g].winners.map((w) => w.u);
      const cc = games[g].winners.map((w) => w.c);

      await update_winner_on_games(
        last_game_id,
        uu.join(","),
        cc.join(","),
        npcPlayers[0].cartela_number.length
      );

      const total_winners = games[g].winners.length;
      const prize_per_winner = Math.floor(win_amount / total_winners);

      const winner_data = await Promise.all(
        games[g].winners.map(async ({ u, c }) => {
          const name = await get_winner_name(u);

          await add_win_amount_to_winner(u, prize_per_winner);

          return { user: u, cartela: c, name };
        })
      );

      io.to(`game_${g}`).emit(
        "bingo",
        winner_data,
        games[g].drawn_numbers,
        games[g].current_number
      );

      emptyRoom(`game_${g}`);

      clear_everything(g);
      setTimeout(() => {
        timer(g);
      }, 2000);

      // console.log(winner_data);
    }, time_left - 250);
  });

  socket.on("left_game", (g, uu) => {
    removeUserFromRoom(g, uu);
  });

  socket.on("left_game_before", (g, uu, gg) => {
    removeUserFromRoom(g, uu);
    remove_user_from_players_list(gg, uu);
  });

  socket.on("disconnect", (reason) => {
    const room = socket.room_id;
    const u = socket.username;
    // console.log("removed", "room", room, u, reason);/
    if (room) {
      const g = room.split("_")[1];
      remove_user_from_players_list(g, u);
    }
  });
});

//Empty rooms after game end
function emptyRoom(roomName) {
  const room = io.sockets.adapter.rooms.get(roomName);

  // console.log("ROom exists");

  if (!room) return; // Room doesn't exist

  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomName);
    }
  }
}

// remove user form room
function removeUserFromRoom(roomName, username) {
  const socketId = userSockets[username];
  if (!socketId) {
    // console.log(`No socket found for username: ${username}`);
    return;
  }

  const socketToRemove = io.sockets.sockets.get(socketId);
  if (socketToRemove) {
    socketToRemove.leave(roomName);
    // console.log(`Removed ${username} from room ${roomName}`);
  } else {
    // console.log(`Socket for ${username} not connected`);
  }
}

// Exlude interval from each object
function remove_interval_from_games() {
  const clean = {};
  for (const id in games) {
    const { interval, call_interval, ...rest } = games[id];
    clean[id] = rest;
  }
  return JSON.stringify(clean);
}

// Remove player from list if they selected cartela
function remove_user_from_players_list(g, u) {
  const index = games[g].players.findIndex((p) => p.user_id === u);
  // console.log(index, "indexxx");
  if (index !== -1) {
    if (0 == 0) {
      // if (!games[g].players[index].is_active) {
      // console.log("Leaving Player", games[g].players[index]);
      games[g].players = games[g].players.filter((p) => p.user_id !== u);
      // console.log("After Leaving Player", games[g].players);
    }
  }
}

// All timer function
function timer(value) {
  let count = 45;

  if (games[value].interval) {
    clearInterval(games[value].interval);
  }

  // Reset NPC tracking
  if (value === value && games[value].npc) {
    games[value].npc_added = 0;
    games[value].npc_last_add_time = 45;
    games[value].npc_numbers_remaining = games[value].npc_count;
    games[value].npc_initialized = false; // Reset for new game
    games[value].npc_lines = [];
  }

  games[value].interval = setInterval(() => {
    count--;
    games[value].count = count;

    const { interval, grace_timeout, ...cleanGame } = games[value];
    io.emit(`timer_${value}`, JSON.stringify(cleanGame));

    // ✅ Enhanced NPC Logic
    if (
      value === games[value].value &&
      games[value].npc &&
      games[value].consecutive_games < 15
    ) {
      // Initialize NPC count with variation (only once per game)
      if (!games[value].npc_initialized) {
        const baseCount = games[value].npc_count;
        const variationHistory = games[value].npc_variation_history || [];

        // Generate non-repeating variation
        let variation;
        let attempts = 0;
        do {
          variation = Math.floor(Math.random() * 5) + 1;
          if (Math.random() > 0.45) variation = -variation;
          attempts++;
        } while (variationHistory.includes(variation) && attempts < 20);

        // Apply variation with limits
        games[value].npc_count = Math.max(
          1,
          Math.min(baseCount + variation, 100)
        );

        // Update variation history (keep last 3)
        variationHistory.unshift(variation);
        if (variationHistory.length > 3) variationHistory.pop();
        games[value].npc_variation_history = variationHistory;

        games[value].npc_initialized = true;
        // console.log(
        //   `[NPC] Count: ${games[value].npc_count} (Variation: ${
        //     variation > 0 ? "+" : ""
        //   }${variation})`
        // );
      }

      // Get or create NPC player
      const npcPlayer = games[value].players.find(
        (p) => p.user_id === "npc"
      ) || {
        user_id: "npc",
        cartela_number: [],
        is_active: true,
      };

      // Get all used numbers across all players
      const allUsedNumbers = new Set(
        games[value].players.flatMap((p) => p.cartela_number)
      );

      // Find available numbers (1-100 not in any cartela)
      const availableNumbers = Array.from(
        { length: 200 },
        (_, i) => i + 1
      ).filter((n) => !allUsedNumbers.has(n));

      const numbersNeeded =
        games[value].npc_count - npcPlayer.cartela_number.length;
      const timeLeft = count;

      if (numbersNeeded > 0 && availableNumbers.length > 0) {
        // Calculate dynamic batch size based on progress
        const progress =
          npcPlayer.cartela_number.length / games[value].npc_count;
        const urgency = 1 - timeLeft / 45; // 0 to 1 as time runs out

        let maxBatchSize;
        if (progress < 0.3) maxBatchSize = 2; // Start small
        else if (progress > 0.7) maxBatchSize = 2; // End small
        else maxBatchSize = 3 + Math.floor(urgency * 2); // 3-5 in middle

        // Add numbers with increasing probability as time runs out
        if (Math.random() < 0.3 + urgency * 0.4) {
          const batchSize = Math.min(
            Math.floor(Math.random() * maxBatchSize) + 1,
            numbersNeeded,
            availableNumbers.length
          );

          // Select random available numbers
          const shuffled = [...availableNumbers].sort(
            () => 0.5 - Math.random()
          );
          const newNumbers = shuffled.slice(0, batchSize);

          if (newNumbers.length > 0) {
            // Initialize NPC if needed
            if (!games[value].players.some((p) => p.user_id === "npc")) {
              games[value].players.push({
                ...npcPlayer,
                cartela_number: newNumbers,
              });
            } else {
              npcPlayer.cartela_number.push(...newNumbers);
            }
            // console.log(npcPlayer.cartela_number[0]);
            // console.log(
            //   `[NPC] Added ${newNumbers.length} numbers: ${newNumbers.join(
            //     ", "
            //   )} ` +
            //     `(Total: ${npcPlayer.cartela_number.length}/${games[value].npc_count})`
            // );

            // Update tracking
            games[value].npc_last_add_time = count;
            if (npcPlayer.cartela_number.length >= games[value].npc_count) {
              // console.log(
              //   `[NPC] Cartela completed with ${games[value].npc_count} numbers`
              // );
            }
          }
        }
      }
    }

    // Game start logic
    if (count < 2) {
      const active_players = games[value].players.filter((p) => p.is_active);
      // if (value === 10) console.log("Active players:", active_players.length);
      const hasNPC = active_players.some((p) => p.user_id === "npc");
      if (hasNPC || active_players.length > 1) {
        const hasRealPlayers = active_players.some((p) => p.user_id !== "npc");
        // console.log("Real Players: ", hasRealPlayers);
        if (hasRealPlayers) {
          games[value].consecutive_games = 0;
        } else {
          games[value].consecutive_games++;
        }
        // console.log(games[value].consecutive_games);
        deduct_from_players_when_game_start(active_players, value);
        create_game(value);
        games[value].active = true;

        // Clean up and broadcast
        const { interval, grace_timeout, ...cleanGame } = games[value];
        io.emit("game-starting", JSON.stringify(cleanGame));
        io.emit(`timer_${value}`, JSON.stringify(cleanGame));
        clearInterval(games[value].interval);
        const npcPlayer = games[value].players.find(
          (p) => p.user_id === "npc"
        ) || {
          user_id: "npc",
          cartela_number: [],
          is_active: true,
        };
        // Start number calling
        games[value].numbers = generate_numbers(
          value,
          npcPlayer.cartela_number[0]
        );
        setTimeout(() => {
          games[value].call_interval = setInterval(() => {
            broadcast_numbers(value, games[value].numbers);
          }, 4000);
        }, 1);
      } else {
        count = 45; // Reset timer if no active players
      }
    }
  }, 1000);
}

// Generate numbers to draw
function generate_numbers(g, c) {
  if (games[g].npc) {
    const card = cards[c - 1];
    return riggedShuffleFlexible(card);
  }

  const numbers = Array.from({ length: 75 }, (_, i) => i + 1);

  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  return numbers;
}

function riggedShuffleFlexible(card) {
  // Choose a random line to win (from the 15 possible lines)
  const winningLines = [
    [card.b1, card.b2, card.b3, card.b4, card.b5], // line1 (B row)
    [card.i1, card.i2, card.i3, card.i4, card.i5], // line2 (I row)
    [card.n1, card.n2, card.n4, card.n5], // line3 (N row - no free space)
    [card.g1, card.g2, card.g3, card.g4, card.g5], // line4 (G row)
    [card.o1, card.o2, card.o3, card.o4, card.o5], // line5 (O row)
    [card.b1, card.i1, card.n1, card.g1, card.o1], // line6 (1st column)
    [card.b2, card.i2, card.n2, card.g2, card.o2], // line7 (2nd column)
    [card.b3, card.i3, card.g3, card.o3], // line8 (3rd column - no N)
    [card.b4, card.i4, card.n4, card.g4, card.o4], // line9 (4th column)
    [card.b5, card.i5, card.n5, card.g5, card.o5], // line10 (5th column)
    [card.b1, card.i2, card.g4, card.o5], // line11 (diagonal)
    [card.b5, card.i4, card.g2, card.o1], // line12 (other diagonal)
    [card.b1, card.b5, card.o1, card.o5], // line13 (corners)
    [card.b1, card.b2, card.i1, card.i2], // line14 (top left 2x2)
    [card.g1, card.g2, card.o1, card.o2], // line15 (bottom left 2x2)
  ];

  // Pick a random winning line (excluding lines with null values)
  const validLines = winningLines.filter((line) => !line.includes(null));
  const winningLine = validLines[Math.floor(Math.random() * validLines.length)];

  // Randomly select target win position between 15-22
  const winAt = Math.floor(Math.random() * 8) + 15; // 15-22 inclusive

  // Get all numbers on the card (excluding null)
  const allCardNumbers = [
    card.b1,
    card.b2,
    card.b3,
    card.b4,
    card.b5,
    card.i1,
    card.i2,
    card.i3,
    card.i4,
    card.i5,
    card.n1,
    card.n2,
    card.n4,
    card.n5, // skipping n3 (null)
    card.g1,
    card.g2,
    card.g3,
    card.g4,
    card.g5,
    card.o1,
    card.o2,
    card.o3,
    card.o4,
    card.o5,
  ].filter((num) => num !== null);

  // Numbers not on the card
  const nonCardNumbers = Array.from({ length: 75 }, (_, i) => i + 1).filter(
    (num) => !allCardNumbers.includes(num)
  );

  // Shuffle the non-card numbers
  for (let i = nonCardNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonCardNumbers[i], nonCardNumbers[j]] = [
      nonCardNumbers[j],
      nonCardNumbers[i],
    ];
  }

  // Calculate how many non-winning numbers to include before the win
  // We want the last winning number to be called at winAt position
  const winningLineLength = winningLine.length;
  const nonWinningBeforeWin = winAt - winningLineLength;

  // First part: some non-card numbers + all winning line numbers
  const firstPart = [];

  // Add non-card numbers that won't trigger other wins
  for (let i = 0; i < nonWinningBeforeWin; i++) {
    firstPart.push(nonCardNumbers.pop());
  }

  // Add all winning line numbers
  firstPart.push(...winningLine);

  // Shuffle this first part to distribute winning numbers
  for (let i = firstPart.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [firstPart[i], firstPart[j]] = [firstPart[j], firstPart[i]];
  }

  // The remaining numbers are all other numbers in random order
  const remainingNumbers = [
    ...allCardNumbers.filter((num) => !winningLine.includes(num)),
    ...nonCardNumbers,
  ].sort(() => Math.random() - 0.5);

  return [...firstPart, ...remainingNumbers];
}

// Broadcast numbers
function broadcast_numbers(g, numbers) {
  if (games[g].counter < numbers.length) {
    games[g].current_number = numbers[games[g].counter];
    games[g].counter++;
    games[g].drawn_numbers.push(games[g].current_number);
    io.to(`game_${g}`).emit("drawing_numbers", JSON.stringify(games[g]));
    if (games[g].npc && games[g].value == g) {
      const npcPlayer = games[g].players.find((p) => p.user_id === "npc") || {
        user_id: "npc",
        cartela_number: [],
        is_active: true,
      };

      npcWinCheckAlgorithm(
        g,
        npcPlayer.cartela_number[0],
        games[g].drawn_numbers,
        numbers[games[g].counter]
      );
    }
  } else {
    games[g].counter = 0;
    clearInterval(games[g].call_interval);
    const { interval, grace_timeout, ...cleanGame } = games[g];
    io.to(`game_${g}`).emit("finished_calling", JSON.stringify(cleanGame));
    timer(g);
    games[g].active = false;
    games[g].numbers = [];
    games[g].drawn_numbers = [];
    games[g].players = [];
    games[g].current_number = null;
  }
}

timer(10);
timer(20);
timer(30);
timer(50);
timer(80);
timer(100);
timer(150);
timer(200);
timer(300);

// Clear everything on bingo
function clear_everything(g) {
  games[g].counter = 0;
  clearInterval(games[g].call_interval);
  games[g].active = false;
  games[g].numbers = [];
  games[g].drawn_numbers = [];
  games[g].players = [];
  games[g].current_number = null;
  games[g].grace_timeout = null;
  games[g].winners = [];
}

// Ceating game
async function create_game(g) {
  const players = games[g].players;
  const usernames = players
    .map((p) => p.user_id)
    .filter(Boolean)
    .map((id) => id.replace(/[^0-9]/g, ""));

  const sanitizedForDb = usernames.join(",");

  const active_players = games[g].players.filter(
    (p) => p.is_active && Array.isArray(p.cartela_number) && p.user_id !== "npc"
  );

  const totalCartelaCount = active_players.reduce(
    (sum, p) => sum + p.cartela_number.length,
    0
  );

  try {
    await pool.query(
      "INSERT INTO games (game, players, no_players, winner, cartela_number,npc_win) VALUES (?, ?, ?, ?, ?,?)",
      [g, sanitizedForDb, totalCartelaCount, "", 0, 0]
    );
    // console.log("✅ Game inserted successfully");
  } catch (err) {
    console.error("❌ Error inserting game:", err.message);
  }
}

// Update winner and winner number on games
async function update_winner_on_games(id, w, n, npc) {
  try {
    const [result] = await pool.query(
      "UPDATE games SET winner = ?, cartela_number = ?, npc_win = ?  WHERE id = ?",
      [w, n, npc, id]
    );

    if (result.affectedRows > 0) {
      // console.log(`✅ Game ${id} updated successfully.`);
    } else {
      console.warn(`⚠️ Game ${id} not found.`);
    }
  } catch (err) {
    console.error(`❌ Failed to update game ${id}:`, err.message);
  }
}

// Get the last game created id
async function get_last_game_id(game) {
  const [rows] = await pool.query(
    "SELECT id FROM games WHERE game = ? ORDER BY id DESC LIMIT 1",
    [game]
  );
  return rows.length ? rows[0].id : null;
}

// Update balance of each user when game starts
async function deduct_from_players_when_game_start(players, value) {
  for (const player of players) {
    const userId = player.user_id;
    const cartelas = Array.isArray(player.cartela_number)
      ? player.cartela_number.length
      : 0;

    if (cartelas === 0) continue;

    const totalCost = cartelas * value;

    const [rows] = await pool.query(
      "SELECT bonus, balance FROM users WHERE phone = ?",
      [userId]
    );

    if (rows.length === 0) {
      console.warn(`User not found: ${userId}`);
      continue;
    }

    let { bonus, balance } = rows[0];

    if (bonus >= totalCost) {
      bonus -= totalCost;
    } else if (bonus + balance >= totalCost) {
      const remaining = totalCost - bonus;
      bonus = 0;
      balance -= remaining;
    } else {
      console.warn(
        `❌ Insufficient funds for user: ${userId} (needs ${totalCost})`
      );
      continue;
    }

    await pool.query(
      "UPDATE users SET bonus = ?, balance = ?, played = played + 1 WHERE phone = ?",
      [bonus, balance, userId]
    );

    // console.log(
    //   `✅ Deducted ${totalCost} from user ${userId} (${cartelas} cartelas) | Bonus: ${bonus}, Balance: ${balance}`
    // );
  }
}

// Update balance of winner
async function add_win_amount_to_winner(phone, amount) {
  try {
    const [result] = await pool.execute(
      `UPDATE users SET balance = balance + ?, won = won + 1 WHERE phone = ?`,
      [amount, phone]
    );

    if (result.affectedRows === 0) {
      // console.log(`No user found with phone: ${phone}`);
      return false;
    }

    // console.log(`Added ${amount} to ${phone}'s balance`);/
    return true;
  } catch (error) {
    console.error("Error updating balance:", error.message);
    return false;
  }
}

// Get winner name
async function get_winner_name(phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT name FROM users WHERE phone = ?`,
      [phone]
    );

    if (rows.length === 0) {
      // console.log(`No user found with phone: ${phone}`);
      return null;
    }

    return rows[0].name;
  } catch (error) {
    console.error("Error fetching user name:", error.message);
    return null;
  }
}

// Win amount calculator
function win_amount_calculator(g, p) {
  return g * p * 0.8;
}

const ADMIN_IDS = [298268884, 353008986];
const states = {};
const isAdmin = (id) => ADMIN_IDS.includes(id);

// Start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  // console.log(chatId);
  const user = await check_user_is_registered(chatId);
  if (user) {
    bot.sendMessage(chatId, "Welcome, please choose an option:", {
      reply_markup: {
        keyboard: [
          ["🎮 Play", "💰 Check Balance"],
          ["📜 Rules", "📞 Contact"],
          ["👥 Invite"],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  } else {
    const referrer_id = match[1];
    if (referrer_id && referrer_id !== chatId) {
      create_referral_data(chatId, referrer_id);
    }

    const opts = {
      reply_markup: {
        keyboard: [
          [
            {
              text: "📱 Share Phone Number",
              request_contact: true,
            },
          ],
        ],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    };

    bot.sendMessage(chatId, "Welcome! Please share your phone number:", opts);
  }
});

// Contact
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const phone = msg.contact.phone_number.replace(/^(\+251|251)/, "");
  const user = msg.contact.first_name;

  try {
    const response = await axios.post("http://localhost:5000/api/signup", {
      telegram_id: chatId,
      phone,
      name: user,
      password: "12345678",
      confirmPassword: "12345678",
    });

    bot.sendMessage(
      chatId,
      `Registarion successful. You have received ETB 10 from us. ENJOY!!!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 Play",
                web_app: {
                  url: `https://centralbingofrontend.vercel.app`,
                },
              },
            ],
          ],
          keyboard: [
            ["🎮 Play", "💰 Check Balance"],
            ["📜 Rules", "📞 Contact"],
            ["👥 Invite"],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }
    );

    reward_the_referrer(chatId);
  } catch (err) {
    console.error("Error calling internal endpoint:", err);
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🎮 Play") {
    bot.sendMessage(chatId, "Wishing good luck", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎮 Play",
              web_app: {
                url: `https://centralbingofrontend.vercel.app`,
              },
            },
          ],
        ],
      },
    });
  } else if (text === "💰 Check Balance") {
    const phone = await get_phone_from_telegram_id(chatId);
    try {
      const res = await axios.get(
        "http://localhost:5000/api/general/get_balance",
        {
          params: { phone },
        }
      );

      if (res.data.status) {
        bot.sendMessage(
          chatId,
          `\`\`\` 💰 Withdrawable Balance : ETB ${res.data.balance} \n 🎁 Non-Withdrawable balance : ETB ${res.data.bonus} \`\`\``,
          {
            parse_mode: "Markdown",
          }
        );
        return;
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.warn("User not found");
        return 0;
      } else {
        console.error("Request failed:", err.message);
        return 0;
      }
    }
  } else if (text === "📜 Rules") {
    bot.sendMessage(
      chatId,
      "የጨዋታ ህግ እና ደንቦች \n\n1) ወደ አቦጊዳ ቢንጎ ሲቀላቀሉ የመጫወቻ 10 ነጥብ ከኛ ስጦታ ያገኛሉ:: \nበዚ የመጫወቻ ነጥብ ተጫውተው ያሸነፉትን ብር ለማውጣት ቢያንስ ከ100 ብር በላይ መሆን ይኖርበታል:: \n\n2) ጨዋታ ለመጀመር ካርቴላ መርጠው ከገቡ በኋላ ጨዋታው ከመጀመሩም በፊት ሆነ ከጀመረ በኋላ አቋርጠው ቢወጡ እንደተጫወት ተቆጥሮ የመጫወቻው መጠን ገንዘብ ከነበረዎት ገንዘብ ላይ ተቆራጭ ይሆናል::\n\n3) ጨዋታ ሲጀመር የመጫወቻ ኳሶች በ5 ሰከንድ ልዩነት መጠራት ይጀምራሉ:: በዚ 5 ሰከንድ ውስጥ በተጠራው ቁጥር አሸናፊ ሁኖ የ ቢንጎ በተን ቀድሞ የተጫነ ሰው አሸናፊ ይሆናል::\n⛔ በተጠራው ቁጥር ሳያሸንፍ ቢንጎ ያለ ተጫዋች ከጨዋታው ይወገዳል::\n\n4) እንደገንዘብዎ መጠን በአንድ ጨዋታ ሁለት ካርቴላ መያዝ ትችላላችሁ::\n\n✅ ብር ለማስገባትም ሆነ ለማውጣት ያለዎትን ቀሪ ሂሳብ በመንካት ማስተካከል ይችላሉ"
    );
  } else if (text === "📞 Contact") {
    bot.sendMessage(chatId, "Contact admins\n @abogidasupport", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Join channel",
              url: "https://t.me/abogidabingo",
            },
          ],
        ],
      },
    });
  } else if (text === "👥 Invite") {
    bot.sendMessage(
      chatId,
      `
🚀 Get Br. 3 for every friend who joins using your link!

🔗 Your Invite Link:
https://t.me/central_bingo_bot?start=${chatId}

👫 The more friends you bring, the more you earn!
💸 They play, you get paid — simple as that.

🎲 Let’s turn Bingo nights into bonus nights!
🎁 Invite now and start earning while having fun!
  `,
      { parse_mode: "Markdown" }
    );
  }

  if (!isAdmin(chatId)) return;

  if (text?.trim().toLowerCase() === "a") {
    states[chatId] = { step: "awaiting_user_phone" };
    return bot.sendMessage(chatId, "📱 Send the phone number of the user:");
  }

  if (states[chatId]?.step === "awaiting_user_phone") {
    const phone = text.replace(/^(\+251|251)/, "");
    const [rows] = await pool.query("SELECT * FROM users WHERE phone = ?", [
      phone,
    ]);

    if (rows.length === 0) {
      return bot.sendMessage(chatId, "❌ User not found.");
    }

    const user = rows[0];
    states[chatId] = { step: "awaiting_action", user };

    return bot.sendMessage(
      chatId,
      `👤 User: ${user.name}\n📞 Phone: ${user.phone}\n💰 Balance: ${user.balance}\n🎁 Bonus: ${user.bonus}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💰 Deposit",
                callback_data: `admin_deposit_${user.phone}`,
              },
              {
                text: "💸 Withdraw",
                callback_data: `admin_withdraw_${user.phone}`,
              },
            ],
          ],
        },
      }
    );
  }

  if (states[chatId]?.step === "awaiting_amount") {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return bot.sendMessage(chatId, "❌ Invalid amount.");
    }

    const { phone, action } = states[chatId];
    const [rows] = await pool.query("SELECT * FROM users WHERE phone = ?", [
      phone,
    ]);

    if (rows.length === 0) {
      return bot.sendMessage(chatId, "❌ User not found.");
    }

    const user = rows[0];

    if (action === "deposit") {
      const newBonus = parseFloat(user.bonus) + amount;
      await pool.query("UPDATE users SET bonus = ? WHERE id = ?", [
        newBonus,
        user.id,
      ]);
      await bot.sendMessage(
        chatId,
        `✅ Deposited ETB ${amount}.\n🎁 New Bonus: ${newBonus}`
      );
    } else {
      if (parseFloat(user.balance) < amount) {
        return bot.sendMessage(chatId, "❌ Insufficient balance.");
      }

      const newBalance = parseFloat(user.balance) - amount;
      await pool.query("UPDATE users SET balance = ? WHERE id = ?", [
        newBalance,
        user.id,
      ]);
      await bot.sendMessage(
        chatId,
        `✅ Withdrew ETB ${amount}.\n💰 New Balance: ${newBalance}`
      );
    }

    delete states[chatId];
  }

  if (text && text.trim().toLowerCase() === "abogida") {
    states[chatId] = {
      step: "awaiting_text",
      messageText: "",
      photos: [],
    };
    return bot.sendMessage(
      chatId,
      "📝 Please send the broadcast message text."
    );
  }

  const state = states[chatId];
  if (!state) return;

  if (state.step === "awaiting_text" && text && !text.startsWith("/")) {
    state.messageText = text;
    state.step = "awaiting_photos";
    return bot.sendMessage(
      chatId,
      "📸 Send photo(s) or type /skip to continue with text only."
    );
  }

  if (state.step === "awaiting_photos") {
    if (msg.photo) {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      state.photos.push(photoId);
      return bot.sendMessage(
        chatId,
        "✅ Photo saved. Send more or type /done to finish."
      );
    }

    if (text === "/skip" || text === "/done") {
      // Fetch all users from DB
      const [users] = await pool.query(
        "SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL"
      );

      if (users.length === 0) {
        await bot.sendMessage(chatId, "⚠️ No users found in the database.");
        states[chatId] = null;
        return;
      }

      // Start broadcast
      await bot.sendMessage(chatId, `📢 Sending to ${users.length} user(s)...`);

      for (const user of users) {
        try {
          if (state.photos.length > 0) {
            for (let i = 0; i < state.photos.length; i++) {
              await bot.sendPhoto(user.telegram_id, state.photos[i], {
                caption: i === 0 ? state.messageText : undefined,
                reply_markup:
                  i === 0
                    ? {
                        inline_keyboard: [
                          [
                            {
                              text: "🎮 Play",
                              web_app: {
                                url: `https://centralbingofrontend.vercel.app`,
                              },
                            },
                          ],
                        ],
                      }
                    : undefined,
              });
            }
          } else {
            await bot.sendMessage(user.telegram_id, state.messageText, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🎮 Play",
                      web_app: {
                        url: `https://centralbingofrontend.vercel.app`,
                      },
                    },
                  ],
                ],
              },
            });
          }
        } catch (e) {
          console.error(`❌ Failed to send to ${user.telegram_id}:`, e.message);
        }
      }

      await bot.sendMessage(chatId, "✅ Broadcast completed.");
      states[chatId] = null; // reset state
    }
  }
});

bot.on("callback_query", async (query) => {
  const data = query.data;

  if (data.startsWith("admin_")) {
    const [_, action, phone] = data.split("_");
    states[query.message.chat.id] = { step: "awaiting_amount", action, phone };
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(
      query.message.chat.id,
      `💵 Enter amount to ${action}:`
    );
  }

  if (data.startsWith("confirm_")) {
    const parts = data.split("_");
    const [, type, phone, amount, txn_id] = parts;
    // console.log(type, phone, amount, txn_id);
    //  amount = parseFloat(amount);

    try {
      const res = await axios.post(
        "http://localhost:5000/api/general/confirm_transaction",
        {
          phone,
          amount,
          type,
          txn_id,
        }
      );

      // Axios puts the response body in `res.data`
      const data = res.data;

      // No need for res.ok — error responses throw automatically

      bot.sendMessage("298268884", "Transaction confirmed");
    } catch (err) {
      // Axios puts backend error messages in err.response.data
      const message =
        err.response?.data?.error || err.message || "Unexpected error";
      // console.log(err.response?.data);
      bot.sendMessage("298268884", message);

      return { message };
    }
  }
});

// Check if user registered before
async function check_user_is_registered(u_id) {
  if (!u_id) return false;

  try {
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE telegram_id = ? LIMIT 1",
      [u_id]
    );
    return rows.length > 0;
  } catch (err) {
    console.error("Error checking user existence:", err);
    return false;
  }
}

// Get phone from telegram id
async function get_phone_from_telegram_id(u_id) {
  if (!u_id) return false;

  try {
    const [rows] = await pool.query(
      "SELECT phone FROM users WHERE telegram_id = ? LIMIT 1",
      [u_id]
    );
    return rows[0].phone;
  } catch (err) {
    console.error("Error checking user existence:", err);
    return false;
  }
}

// Create referral data
async function create_referral_data(new_telegram_id, referrer_telegram_id) {
  try {
    const sql = `
        INSERT IGNORE INTO referrals (
          new_telegram_id,
          referrer_telegram_id
        ) VALUES ( ?, ?)
      `;

    const [result] = await pool.query(sql, [
      new_telegram_id,
      referrer_telegram_id,
    ]);
  } catch (err) {
    // console.log("Referral failed.", err);
  }
}

// Reward the referrer
async function reward_the_referrer(u_id) {
  const [rows] = await pool.query(
    `SELECT referrer_telegram_id FROM referrals where new_telegram_id = ${u_id}`
  );
  if (rows.length > 0) {
    let r_id = rows[0].referrer_telegram_id.toString();

    try {
      const [rows2] = await pool.query(
        `SELECT bonus FROM users WHERE telegram_id = ?`,
        [r_id]
      );

      if (rows2.length === 0) {
        // console.log("User not found");
        return;
      }

      const currentBalance = rows2[0].bonus;
      const newBalance = currentBalance + 3;

      // Step 2: Update the balance
      await pool.query(`UPDATE users SET bonus = ? WHERE telegram_id = ?`, [
        newBalance,
        r_id,
      ]);
      const phone = await get_phone_from_telegram_id(r_id);
      const new_phone = await get_phone_from_telegram_id(u_id);

      try {
        const res = await axios.get(
          "http://localhost:5000/api/general/get_balance",
          {
            params: { phone },
          }
        );

        if (res.data.status) {
          bot.sendMessage(
            r_id,
            `User ${new_phone} joined by your invite link. You are rewareded with ETB 3.  \`\`\` 💰 Withdrawable Balance : ETB ${res.data.balance} \n 🎁 Non-Withdrawable balance : ETB ${res.data.bonus} \`\`\``,
            {
              parse_mode: "Markdown",
            }
          );
          return;
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.warn("User not found");
          return 0;
        } else {
          console.error("Request failed:", err.message);
          return 0;
        }
      }
    } catch (err) {
      console.error("❌ Error updating winner's balance:", err.message);
      throw err;
    }
    // return rows;
  }
}

// NPC win checker algorithm
async function npcWinCheckAlgorithm(g, n, d, c) {
  // console.log("current:", c);
  const card = cards[n - 1];
  // console.log(card);
  let line1 = [card.b1, card.b2, card.b3, card.b4, card.b5];
  let line2 = [card.i1, card.i2, card.i3, card.i4, card.i5];
  let line3 = [card.n1, card.n2, card.n4, card.n5];
  let line4 = [card.g1, card.g2, card.g3, card.g4, card.g5];
  let line5 = [card.o1, card.o2, card.o3, card.o4, card.o5];
  let line6 = [card.b1, card.i1, card.n1, card.g1, card.o1];
  let line7 = [card.b2, card.i2, card.n2, card.g2, card.o2];
  let line8 = [card.b3, card.i3, card.g3, card.o3];
  let line9 = [card.b4, card.i4, card.n4, card.g4, card.o4];
  let line10 = [card.b5, card.i5, card.n5, card.g5, card.o5];
  let line11 = [card.b1, card.i2, card.g4, card.o5];
  let line12 = [card.b5, card.i4, card.g2, card.o1];
  let line13 = [card.b1, card.b5, card.o1, card.o5];
  let line14 = [card.b1, card.b2, card.i1, card.i2];
  let line15 = [card.g1, card.g2, card.o1, card.o2];
  const all_lines = [
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    line14,
    line15,
  ];
  all_lines.forEach((l) => {
    if (l.every((element) => d.includes(element))) {
      // lineMakingArray.push([...l]);
      for (let i = 0; i < l.length; i++) {
        games[g].npc_lines.push(l[i]);
      }
    }
  });

  let u = "npc";

  if (games[g].npc_lines.length > 0) {
    // console.log("WON", games[g].npc_lines, n);

    const now = Date.now();
    const time_passed = now - games[g].last_number_called_at;
    const time_left = 4000 - time_passed;

    games[g].winners.push({
      u,
      c: n,
    });

    if (games[g].grace_timeout) return;

    games[g].grace_timeout = setTimeout(async () => {
      clearInterval(games[g].call_interval);

      const active_players = games[g].players.filter(
        (p) => p.is_active && Array.isArray(p.cartela_number)
      );
      const npcPlayers = games[g].players.filter(
        (p) =>
          p.is_active && Array.isArray(p.cartela_number) && p.user_id === "npc"
      );

      const totalCartelaCount = active_players.reduce(
        (sum, p) => sum + p.cartela_number.length,
        0
      );

      const win_amount = win_amount_calculator(g, totalCartelaCount);

      const winner_user_ids = games[g].winners;

      const last_game_id = await get_last_game_id(g);

      const uu = games[g].winners.map((w) => w.u);
      const cc = games[g].winners.map((w) => w.c);

      await update_winner_on_games(
        last_game_id,
        uu.join(","),
        cc.join(","),
        npcPlayers[0].cartela_number.length
      );
      const total_winners = games[g].winners.length;
      const prize_per_winner = Math.floor(win_amount / total_winners);

      const npcName = names[Math.floor(Math.random() * 669) + 1];

      const winner_data = await Promise.all(
        games[g].winners.map(async ({ u, c }) => {
          const name = await get_winner_name(u);

          await add_win_amount_to_winner(u, prize_per_winner);

          return { user: u, cartela: c, name: npcName };
        })
      );

      io.to(`game_${g}`).emit(
        "bingo",
        winner_data,
        games[g].drawn_numbers,
        games[g].current_number,
        games[g].npc_lines,
        card
      );

      emptyRoom(`game_${g}`);

      clear_everything(g);
      setTimeout(() => {
        timer(g);
      }, 2000);

      // console.log("Npc Players: ", npcPlayers[0].cartela_number.length);
    }, time_left - 250);
  } else {
    // console.log("Not won: ", games[g].npc_lines, n);
  }
}

async function scrapeTelebrirReceipt(receiptUrl) {
  try {
    // Fetch the HTML content
    const response = await axios.get(receiptUrl);
    const html = response.data;

    // Load HTML into Cheerio
    const $ = cheerio.load(html);

    // Helper function to extract numeric value from currency string
    const extractNumericValue = (currencyString) => {
      const numericValue = parseFloat(currencyString.replace(/[^\d.]/g, ""));
      return isNaN(numericValue) ? null : numericValue;
    };

    // Extract the essential data
    const receiptData = {
      // Sender information
      senderName: $('td:contains("የከፋይ ስም/Payer Name")').next().text().trim(),
      senderPhone: $('td:contains("የከፋይ ቴሌብር ቁ./Payer telebirr no.")')
        .next()
        .text()
        .trim(),

      // Receiver information
      receiverName: $('td:contains("የገንዘብ ተቀባይ ስም/Credited Party name")')
        .next()
        .text()
        .trim(),
      receiverPhone: $(
        'td:contains("የገንዘብ ተቀባይ ቴሌብር ቁ./Credited party account no")'
      )
        .next()
        .text()
        .trim(),
      serviceFee: extractNumericValue(
        $('td:contains("የአገልግሎት ክፍያ/Service fee")').next().text().trim()
      ),
      serviceFeeVAT: extractNumericValue(
        $('td:contains("የአገልግሎት ክፍያ ተ.እ.ታ/Service fee VAT")')
          .next()
          .text()
          .trim()
      ),
      // Transaction details
      amount: extractNumericValue(
        $('td:contains("ጠቅላላ የተከፈለ/Total Paid Amount")').next().text().trim()
      ),
      status: $('td:contains("የክፍያው ሁኔታ/transaction status")')
        .next()
        .text()
        .trim(),
    };

    return receiptData;
  } catch (error) {
    console.error("Error scraping receipt:", error);
    throw error;
  }
}

const receiptUrl = "https://transactioninfo.ethiotelecom.et/receipt/CHB655VDA2";

server.listen(5000, "0.0.0.0", () => {
  console.log("Server running at http://localhost:5000");
});
