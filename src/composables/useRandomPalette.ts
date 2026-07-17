export interface CharacterPalette {
  bodyColor: string;
  hairColor: string;
  hatColor: string;
  pantsColor: string;
  shoeColor: string;
  gender: 'boy' | 'girl';
  hasHat: boolean;
  paddleColor: string;
  paddleHandleColor: string;
  paddleGripColor: string;
  paddleEdgeColor: string;
}

interface Palette {
  shirt: string;
  pants: string;
  hat: string;
  hair: string;
  shoe: string;
  gender: 'boy' | 'girl';
  hasHat?: boolean;
  paddle: string;
  handle: string;
  grip: string;
  edge: string;
}

const PALETTES: Palette[] = [
  {
    shirt: '#c9184a',
    pants: '#22223b',
    hat: '#ffd93d',
    hair: '#6b4226',
    shoe: '#ffffff',
    gender: 'girl',
    paddle: '#2d3047',
    handle: '#ff6b9d',
    grip: '#c2185b',
    edge: '#c9184a',
  },
  {
    shirt: '#e91e63',
    pants: '#1d3557',
    hat: '#ffd93d',
    hair: '#3b2317',
    shoe: '#f8f9fa',
    gender: 'girl',
    paddle: '#1a2a40',
    handle: '#ff6b9d',
    grip: '#c2185b',
    edge: '#e91e63',
  },
  {
    shirt: '#9c27b0',
    pants: '#22223b',
    hat: '#ffbe0b',
    hair: '#8b5a2b',
    shoe: '#ffffff',
    gender: 'girl',
    paddle: '#283044',
    handle: '#ab47bc',
    grip: '#6a1b9a',
    edge: '#9c27b0',
  },
  {
    shirt: '#ad1457',
    pants: '#457b9d',
    hat: '#ffbe0b',
    hair: '#6b4226',
    shoe: '#e9ecef',
    gender: 'girl',
    paddle: '#1a2a40',
    handle: '#ff7043',
    grip: '#bf360c',
    edge: '#ad1457',
  },
  {
    shirt: '#ec407a',
    pants: '#22223b',
    hat: '#a8dadc',
    hair: '#1a1a1a',
    shoe: '#ffffff',
    gender: 'girl',
    paddle: '#1e3d59',
    handle: '#7e57c2',
    grip: '#4527a0',
    edge: '#a8dadc',
  },
  {
    shirt: '#7b1fa2',
    pants: '#80ed99',
    hat: '#ffbe0b',
    hair: '#8b5a2b',
    shoe: '#f8f9fa',
    gender: 'girl',
    paddle: '#283044',
    handle: '#ab47bc',
    grip: '#6a1b9a',
    edge: '#ffbe0b',
  },
  {
    shirt: '#d81b60',
    pants: '#457b9d',
    hat: '#c5a3ff',
    hair: '#3b2317',
    shoe: '#e9ecef',
    gender: 'girl',
    paddle: '#1a2a40',
    handle: '#ec407a',
    grip: '#ad1457',
    edge: '#c5a3ff',
  },
  {
    shirt: '#e63946',
    pants: '#ffd60a',
    hat: '#4cc9f0',
    hair: '#6b4226',
    shoe: '#ffffff',
    gender: 'girl',
    paddle: '#1e3d59',
    handle: '#ff7043',
    grip: '#bf360c',
    edge: '#4cc9f0',
  },
  {
    shirt: '#1565c0',
    pants: '#22223b',
    hat: '#ffd60a',
    hair: '#1a1a1a',
    shoe: '#ffffff',
    gender: 'boy',
    paddle: '#1e3d59',
    handle: '#26c6da',
    grip: '#00838f',
    edge: '#1565c0',
  },
  {
    shirt: '#2e7d32',
    pants: '#1d3557',
    hat: '#ff6b6b',
    hair: '#2d1b0e',
    shoe: '#f8f9fa',
    gender: 'boy',
    paddle: '#283044',
    handle: '#42a5f5',
    grip: '#1565c0',
    edge: '#ff6b6b',
  },
  {
    shirt: '#00695c',
    pants: '#1d3557',
    hat: '#ffbe0b',
    hair: '#1a1a1a',
    shoe: '#dee2e6',
    gender: 'boy',
    paddle: '#1a2a40',
    handle: '#26a69a',
    grip: '#00695c',
    edge: '#ffbe0b',
  },
  {
    shirt: '#283593',
    pants: '#e63946',
    hat: '#ffd60a',
    hair: '#2d1b0e',
    shoe: '#f8f9fa',
    gender: 'boy',
    paddle: '#283044',
    handle: '#5c6bc0',
    grip: '#283593',
    edge: '#ffd60a',
  },
  {
    shirt: '#0277bd',
    pants: '#e63946',
    hat: '#ffd60a',
    hair: '#3b2317',
    shoe: '#ffffff',
    gender: 'boy',
    paddle: '#1e3d59',
    handle: '#42a5f5',
    grip: '#1565c0',
    edge: '#ffd60a',
  },
  {
    shirt: '#1b5e20',
    pants: '#1d3557',
    hat: '#ff5400',
    hair: '#1a1a1a',
    shoe: '#dee2e6',
    gender: 'boy',
    paddle: '#1e3d59',
    handle: '#26a69a',
    grip: '#00695c',
    edge: '#ff5400',
  },
  {
    shirt: '#e65100',
    pants: '#1d3557',
    hat: '#4cc9f0',
    hair: '#3b2317',
    shoe: '#f8f9fa',
    gender: 'boy',
    paddle: '#283044',
    handle: '#ffca28',
    grip: '#f57f17',
    edge: '#4cc9f0',
  },
  {
    shirt: '#00838f',
    pants: '#457b9d',
    hat: '#ff6b6b',
    hair: '#2d1b0e',
    shoe: '#ffffff',
    gender: 'boy',
    paddle: '#1a2a40',
    handle: '#66bb6a',
    grip: '#2e7d32',
    edge: '#ff6b6b',
  },
];

export function useRandomPalette() {
  function randomPalette(): CharacterPalette {
    const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    return {
      bodyColor: p.shirt,
      hairColor: p.hair,
      hatColor: p.hat,
      pantsColor: p.pants,
      shoeColor: p.shoe,
      gender: p.gender,
      hasHat: Math.random() > 0.5,
      paddleColor: p.paddle,
      paddleHandleColor: p.handle,
      paddleGripColor: p.grip,
      paddleEdgeColor: p.edge,
    };
  }

  return { randomPalette };
}
