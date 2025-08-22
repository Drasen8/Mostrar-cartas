"use client";
import React from 'react';

export function RoomHeader(props: {
  code?: string;
  players?: number;
  isHost?: boolean;
  onStart?: () => void;
}) {
  return (
    <div className="bg-green-950/80 p-4 text-white">
      <div className="container mx-auto flex items-center jutify-between">
        <div className="flex items-center space-x-6">
          <div className="bg-yellow-500 px-4 py-2 rounded-lg">
            <span className="font-bold">Código: {props.code}</span>
          </div>
          <div>
            <span>Jugadores: {props.players ?? 0}</span>
          </div>
        </div>
        {props.isHost && (
          <button
            onClick={props.onStart}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition"
          >
            Iniciar partida
          </button>
        )}
      </div>
    </div>
  );
}