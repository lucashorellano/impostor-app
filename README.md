# Juego del Impostor (hasta 30 jugadores)

MVP listo para jugar en grupo (presencial o por videollamada).

## Características
- **Hasta 30 jugadores** por sala.
- **1 impostor cada 4 jugadores** (mínimo 1), con **rotación automática** en cada ronda.
- **Temporizador por ronda** configurable (hasta **5 minutos**). Al llegar a 0, la app **inicia la votación** automáticamente.
- **Múltiples rondas**: el HOST puede pasar a la siguiente ronda cuando quiera.
- **Marcador**: puntaje por equipos (Conocen vs Impostores) y **puntaje por jugador** (+1 a cada no impostor si ganan los que conocían la palabra; +1 a cada impostor si ganan los impostores).
- **Palabras** fijas: `Mate`, `Sushi`, `Harry Potter`, `Fast & Furious`, `Los Simpson`, `Johnny Depp`, `George Clooney`, `Extraterrestre`, `Paris`, `New York`.

## Requisitos
- Node.js 18+

## Correr local
```bash
npm install
npm start
# Abrí http://localhost:3000
```

## Flujo de juego
1. El HOST crea la sala y define la **duración de la ronda** (1–5 min).
2. Todos se unen con un nombre.
3. **Roles**: los no impostores ven la **palabra**; los impostores ven que son **Impostor**.
4. **Discusión** hasta que termine el temporizador o el HOST arranque la votación.
5. **Votación**: se cierra cuando todos votan o el HOST la cierra.
6. **Resultados**: se muestra expulsado y si era impostor, se actualiza el **marcador**.
7. El HOST puede ir a **Siguiente ronda** (nueva palabra y **nuevos impostores**), o **Volver al lobby**.

## Deploy
- Compatible con Render/Railway/Heroku/Azure Web Apps.
- Exponer correctamente la variable `PORT` si la plataforma lo exige.

## Notas
- Todo el estado está **en memoria** (no persistente). Reiniciar el proceso limpia salas/puntajes.
- Si el HOST se desconecta, se reasigna automáticamente al primer jugador conectado de la sala.
