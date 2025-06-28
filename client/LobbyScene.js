class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
  }

  create() {
    this.add.text(300, 250, 'Lobby Scene', {
      fontSize: '32px',
      color: '#ffffff'
    });
  }
}