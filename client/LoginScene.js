class LoginScene extends Phaser.Scene {
  constructor() {
    super('LoginScene');
  }

  create() {
    this.add.text(300, 250, 'Login Scene', {
      fontSize: '32px',
      color: '#ffffff'
    });
  }
}