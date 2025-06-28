// index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// CORS設定：フロントエンドがデプロイされるGitHub PagesのURLを許可する
// 開発中は 'http://localhost:8080' なども追加すると良いでしょう
const io = socketIo(server, {
    cors: {
        origin: "https://<あなたのGitHubユーザー名>.github.io", // 例: "https://your-username.github.io"
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; // ポート番号

// 部屋とプレイヤーの状態を管理するオブジェクト
const rooms = new Map(); // roomCode -> Roomオブジェクト

// ゲームループの管理
const GAME_TICK_RATE = 1000 / 30; // 30 FPS
const gameLoops = new Map(); // roomCode -> setInterval ID

class Player {
    constructor(id, name, roomCode) {
        this.id = id;
        this.name = name;
        this.roomCode = roomCode;
        this.job = null; // 選択された職業ID
        this.isReady = false;
        this.x = 0; // 初期位置
        this.y = 0; // 初期位置
        this.hp = 100; // 初期HP
        this.maxHp = 100;
        // その他、プレイヤー固有の状態 (スキルクールダウンなど)
    }
}

class Room {
    constructor(roomCode, hostId) {
        this.roomCode = roomCode;
        this.players = new Map(); // playerId -> Playerオブジェクト
        this.hostId = hostId;
        this.state = 'lobby'; // 'lobby', 'game', 'result'
        this.boss = {
            id: 'boss1',
            hp: 1000,
            maxHp: 1000,
            x: 0, // ボスの初期位置
            y: 0,
            phase: 1,
            currentAttack: null,
            // その他、ボスの状態 (攻撃パターン、クールダウンなど)
        };
        this.enemyBullets = []; // ゲーム中の敵弾の状態
        // その他、ゲーム進行に必要な状態
    }

    addPlayer(player) {
        this.players.set(player.id, player);
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    // 部屋の状態をクライアントに送信するための整形
    getRoomStateForClient() {
        return {
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                job: p.job,
                isReady: p.isReady
            })),
            roomCode: this.roomCode,
            hostId: this.hostId
        };
    }
}

// ヘルパー関数: socket.id からプレイヤーオブジェクトを見つける
function findPlayerInRooms(playerId) {
    for (const room of rooms.values()) {
        if (room.players.has(playerId)) {
            return room.players.get(playerId);
        }
    }
    return null;
}

// ゲームループの開始と停止
function startGameLoop(roomCode) {
    if (gameLoops.has(roomCode)) {
        clearInterval(gameLoops.get(roomCode));
    }
    const intervalId = setInterval(() => {
        updateGameLogic(roomCode);
    }, GAME_TICK_RATE);
    gameLoops.set(roomCode, intervalId);
    console.log(`Game loop started for room: ${roomCode}`);
}

function stopGameLoop(roomCode) {
    if (gameLoops.has(roomCode)) {
        clearInterval(gameLoops.get(roomCode));
        gameLoops.delete(roomCode);
        console.log(`Game loop stopped for room: ${roomCode}`);
    }
}

// ゲームロジックの更新（ゲームループ内で呼び出される）
function updateGameLogic(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'game') {
        stopGameLoop(roomCode); // ゲーム中でなければループを停止
        return;
    }

    // --- ここにゲームのコアロジックを実装 ---
    // 例:
    // 1. プレイヤーの移動位置更新 (client:playerMoveで受け取ったvx, vyを適用)
    //    各プレイヤーのx, y座標を更新する
    // 2. ボスのAI更新 (攻撃パターン、フェーズ移行など)
    //    room.bossの状態を更新する
    // 3. 敵弾の移動、生成、消滅
    //    room.enemyBullets配列を更新する
    // 4. 当たり判定 (プレイヤー vs 敵弾、プレイヤー攻撃 vs ボス)
    //    ダメージ計算を行い、HPを更新する
    // 5. HP更新 (プレイヤー、ボス)
    //    room.players内の各プレイヤーのhpとroom.boss.hpを更新する
    // 6. 勝敗判定
    //    ボスのHPが0か、全プレイヤーのHPが0になったかをチェックし、ゲーム終了処理を呼び出す
    // --- ここまで ---

    // ゲーム状態をクライアントにブロードキャスト
    // server:gameStateUpdate
    io.to(roomCode).emit('server:gameStateUpdate', {
        players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            hp: p.hp
        })),
        boss: {
            hp: room.boss.hp,
            x: room.boss.x,
            y: room.boss.y,
            currentAttack: room.boss.currentAttack,
            phase: room.boss.phase
        },
        enemyBullets: room.enemyBullets.map(bullet => ({
            id: bullet.id,
            type: bullet.type,
            x: bullet.x,
            y: bullet.y,
            angle: bullet.angle
        }))
    });

    // 勝敗判定の例
    if (room.boss.hp <= 0) {
        io.to(room.roomCode).emit('server:gameOver', { result: 'win' });
        stopGameLoop(room.roomCode);
        room.state = 'result'; // 部屋の状態をリザルトへ変更
        console.log(`Game over in room ${room.roomCode}: Win!`);
        // 必要に応じて、部屋のリセットやプレイヤーのロビーへの戻り処理をここで呼び出す
    } else if (Array.from(room.players.values()).every(p => p.hp <= 0)) {
        io.to(room.roomCode).emit('server:gameOver', { result: 'lose' });
        stopGameLoop(room.roomCode);
        room.state = 'result'; // 部屋の状態をリザルトへ変更
        console.log(`Game over in room ${room.roomCode}: Lose!`);
        // 必要に応じて、部屋のリセットやプレイヤーのロビーへの戻り処理をここで呼び出す
    }
}


// HTTPルート (オプション、デバッグやサーバー稼働確認用)
app.get('/', (req, res) => {
    res.send('Web 2D Boss Battle Server is running!');
});

// Socket.IO接続イベント
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // クライアントが切断した際の処理
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // プレイヤーがどの部屋にいたかを探し、その部屋から削除する
        let disconnectedPlayerRoomCode = null;
        rooms.forEach(room => {
            if (room.players.has(socket.id)) {
                room.removePlayer(socket.id);
                disconnectedPlayerRoomCode = room.roomCode;

                if (room.players.size === 0) {
                    // 部屋に誰もいなくなったら部屋を削除し、ゲームループも停止
                    rooms.delete(room.roomCode);
                    stopGameLoop(room.roomCode);
                    console.log(`Room ${room.roomCode} deleted as all players disconnected.`);
                } else {
                    // 他のプレイヤーに部屋の状態更新を通知
                    io.to(room.roomCode).emit('server:roomUpdate', room.getRoomStateForClient());
                    io.to(room.roomCode).emit('server:playerDisconnected', { playerId: socket.id });

                    // ゲーム中の切断の場合、勝敗判定に影響する可能性も考慮 (例: 全員切断で敗北など)
                    if (room.state === 'game' && Array.from(room.players.values()).every(p => p.hp <= 0)) {
                         // 切断によって全員のHPが0になったと判断できる場合
                        io.to(room.roomCode).emit('server:gameOver', { result: 'lose' });
                        stopGameLoop(room.roomCode);
                        room.state = 'result';
                        console.log(`Game over in room ${room.roomCode}: Lose (all players disconnected/dead)!`);
                    }
                }
                return; // ループを抜ける
            }
        });
    });

    // client:joinRoom イベントハンドラ
    socket.on('client:joinRoom', (data) => {
        const { playerName, roomCode } = data;
        let room = rooms.get(roomCode);

        if (!room) {
            // 部屋が存在しない場合、新規作成
            room = new Room(roomCode, socket.id); // 最初の参加者をホストとする
            rooms.set(roomCode, room);
            console.log(`New room created: ${roomCode} by ${socket.id}`);
        }
        // TODO: 部屋が満員かどうかのチェック (必要であれば)
        // TODO: 「部屋の合言葉」がパスワードを意味するなら、ここで認証ロジックを追加

        // 既に同じIDのプレイヤーが接続中かどうかのチェック (再接続など)
        if (room.players.has(socket.id)) {
            // 既にこの部屋にいる場合は何もしないか、エラーを返す
            console.warn(`Player ${socket.id} tried to join room ${roomCode} but is already in it.`);
            socket.emit('server:errorMessage', { code: 'ALREADY_IN_ROOM', message: 'You are already in this room.' });
            return;
        }

        const player = new Player(socket.id, playerName, roomCode);
        room.addPlayer(player);
        socket.join(roomCode); // Socket.IOのroom機能を使って、特定の部屋のクライアントにのみイベントを送信できるようにする

        console.log(`Player ${playerName} (${socket.id}) joined room ${roomCode}`);

        socket.emit('server:joinRoomSuccess', { playerId: socket.id, roomCode: roomCode });
        // 部屋の全員に更新を通知
        io.to(roomCode).emit('server:roomUpdate', room.getRoomStateForClient());
    });

    // client:selectJob イベントハンドラ
    socket.on('client:selectJob', (data) => {
        const { jobId } = data;
        const player = findPlayerInRooms(socket.id);
        if (player) {
            const room = rooms.get(player.roomCode);
            if (room && room.state === 'lobby') { // ロビー状態でのみ職業選択を許可
                // TODO: 職業の重複選択や有効な職業IDかのチェック
                // 例: const availableJobs = ['warrior', 'mage', 'rogue', 'healer'];
                // if (!availableJobs.includes(jobId)) { /* エラー処理 */ }
                // if (Array.from(room.players.values()).some(p => p.job === jobId)) { /* エラー処理: 職業は既に選択されています */ }

                player.job = jobId;
                io.to(room.roomCode).emit('server:roomUpdate', room.getRoomStateForClient());
                console.log(`Player ${player.name} selected job ${jobId}`);
            } else {
                socket.emit('server:errorMessage', { code: 'INVALID_STATE', message: 'Cannot select job at this time.' });
            }
        } else {
            socket.emit('server:errorMessage', { code: 'PLAYER_NOT_FOUND', message: 'You are not in any room.' });
        }
    });

    // client:setReady イベントハンドラ
    socket.on('client:setReady', (data) => {
        const { isReady } = data;
        const player = findPlayerInRooms(socket.id);
        if (player) {
            const room = rooms.get(player.roomCode);
            if (room && room.state === 'lobby') { // ロビー状態でのみ準備OK/キャンセルを許可
                player.isReady = isReady;
                io.to(room.roomCode).emit('server:roomUpdate', room.getRoomStateForClient());
                console.log(`Player ${player.name} set ready: ${isReady}`);

                // 全員が準備OKになったらゲーム開始のチェック
                const allPlayersReady = Array.from(room.players.values()).every(p => p.isReady && p.job !== null);
                // 参加プレイヤーが少なくとも1人以上いることを確認 (ホストと自分だけでもゲームはできる想定)
                if (allPlayersReady && room.players.size > 0 && room.state === 'lobby') {
                    room.state = 'game'; // 部屋の状態をゲーム中に変更
                    console.log(`All players in room ${room.roomCode} are ready. Starting game!`);
                    io.to(room.roomCode).emit('server:gameStart', {
                        initialBossState: room.boss,
                        initialPlayerStates: Array.from(room.players.values()).map(p => ({
                            id: p.id,
                            hp: p.hp,
                            maxHp: p.maxHp,
                            x: p.x,
                            y: p.y,
                            job: p.job
                        }))
                    });
                    // ゲームループを開始
                    startGameLoop(room.roomCode);
                }
            } else {
                socket.emit('server:errorMessage', { code: 'INVALID_STATE', message: 'Cannot change ready state at this time.' });
            }
        } else {
            socket.emit('server:errorMessage', { code: 'PLAYER_NOT_FOUND', message: 'You are not in any room.' });
        }
    });

    // client:playerMove イベントハンドラ (定期的に送信されるプレイヤーの移動情報)
    socket.on('client:playerMove', (data) => {
        const { vx, vy } = data; // 正規化された方向ベクトル (例: {-1, 0}, {0, 1}, {1, 1} など)
        const player = findPlayerInRooms(socket.id);
        if (player) {
            const room = rooms.get(player.roomCode);
            if (room && room.state === 'game') { // ゲーム中のみ移動処理を許可
                // TODO: プレイヤーの移動速度を定義し、vx, vyに基づいてplayer.x, player.yを更新
                // 例: const playerSpeed = 5;
                // player.x += vx * playerSpeed;
                // player.y += vy * playerSpeed;

                // TODO: 移動制限 (画面外に出ないようにする、壁との衝突判定など)
            }
        }
    });

    // client:playerAttack イベントハンドラ (通常攻撃またはスキル発動)
    socket.on('client:playerAttack', (data) => {
        const { type, skillId, aimX, aimY } = data; // type: 'normal' | 'skill', skillId (スキル使用時), aimX, aimY (マウスカーソルのワールド座標)
        const player = findPlayerInRooms(socket.id);
        if (player) {
            const room = rooms.get(player.roomCode);
            if (room && room.state === 'game') { // ゲーム中のみ攻撃処理を許可
                if (type === 'normal') {
                    // TODO: 通常攻撃のロジック
                    // - プレイヤーの位置、aimX/aimYから攻撃の軌道を計算
                    // - 攻撃の当たり判定（ボスとの距離、攻撃範囲など）
                    // - ボスにダメージを与えたら server:bossDamaged を送信
                    // 例:
                    // const damage = 10;
                    // room.boss.hp -= damage;
                    // io.to(room.roomCode).emit('server:bossDamaged', { damageAmount: damage, remainingHp: room.boss.hp });
                    // console.log(`Player ${player.name} attacked boss. Boss HP: ${room.boss.hp}`);

                } else if (type === 'skill' && skillId) {
                    // TODO: スキルのロジック
                    // - スキルIDに基づいて、効果、クールダウン、ダメージなどを計算
                    // - クールダウン中の場合、server:playerAttackFeedback で失敗を通知
                    // - スキルの効果をゲーム状態に反映 (例: プレイヤーへのヒール、敵への状態異常、特殊な弾の生成)
                    // 例:
                    // if (player.cooldowns[skillId] > 0) {
                    //     socket.emit('server:playerAttackFeedback', { success: false, reason: 'OnCooldown', cooldownRemaining: player.cooldowns[skillId] });
                    //     return;
                    // }
                    // player.cooldowns[skillId] = 5; // クールダウン設定
                    // // スキル固有のロジック...
                    // socket.emit('server:playerAttackFeedback', { success: true });
                }
            } else {
                socket.emit('server:errorMessage', { code: 'INVALID_STATE', message: 'Cannot attack at this time.' });
            }
        } else {
            socket.emit('server:errorMessage', { code: 'PLAYER_NOT_FOUND', message: 'You are not in any room.' });
        }
    });

    // TODO: 他の client:* イベントハンドラも同様に実装していく
    // 例: client:playerUseItem, client:chatMessage など、必要に応じて
});

// サーバー起動
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});