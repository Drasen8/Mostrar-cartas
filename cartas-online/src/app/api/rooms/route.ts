import { NextResponse } from 'next/server';
import { roomStorage } from './storage';

function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 6;
  let code = '';
  for (let i = 0; i < codeLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }
  if (roomStorage.getRoom(code)) return generateRoomCode();
  return code;
}

// POST /api/rooms - Crear nueva sala
export async function POST() {
  try {
    const roomCode = generateRoomCode();
    const hostId = crypto.randomUUID();
    const newRoom = {
      code: roomCode,
      hostId,
      // Añadimos el host como primer jugador para que reciba cartas al iniciar
      players: [{
        id: hostId,
        joinedAt: new Date().toISOString()
      }],
      status: 'waiting' as const,
      createdAt: new Date().toISOString(),
    };

    roomStorage.setRoom(roomCode, newRoom);
    console.log('[POST] Room created:', roomCode);
    return NextResponse.json({ code: roomCode, room: newRoom });
  } catch (error) {
    console.error('[POST] Error:', error);
    return NextResponse.json({ error: 'Error al crear la sala' }, { status: 500 });
  }
}

// GET /api/rooms/:code - Unirse a una sala
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.pathname.split('/').pop()?.toUpperCase();
  
  console.log('Buscando sala:', code);
  console.log('Salas disponibles:', Object.keys(roomStorage));

  if (!code || !roomStorage[code]) {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ room: roomStorage[code] });
}

// Función para manejar la unión a una sala
const handleJoinRoom = async (codigo: string, setError: (msg: string) => void, setShowModal: (show: boolean) => void, setRoomInfo: (info: { code: string, players: number, isHost: boolean }) => void) => {
  if (!codigo.trim()) {
    setError('Por favor, ingrese un código');
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${codigo.toUpperCase()}`);
    const data = await response.json();
    
    if (!response.ok) {
      setError(data.error || 'Código de sala inválido');
      return;
    }
    
    setShowModal(false);
    setRoomInfo({
      code: codigo.toUpperCase(),
      players: data.room.players.length + 1,
      isHost: false
    });
  } catch (err) {
    setError('Error al unirse a la sala');
  }
};