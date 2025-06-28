const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1d1d1d',
    scene: [LoginScene, LobbyScene, GameScene]
  };
  
  const game = new Phaser.Game(config);
  
  // 最初に LoginScene を表示（他はまだ使わない）
  game.scene.start('LoginScene');