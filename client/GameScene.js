class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.add.text(300, 250, 'Game Scene', {
      fontSize: '32px',
      color: '#ffffff'
    });
  }
}