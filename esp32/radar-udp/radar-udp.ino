/* ═══════════════════════════════════════════════════════════════════════════
   radar-udp — la schedina ESP32-C3 accanto al radar HLK-LD2450.

   Legge il radar dalla seriale e, a OGNI quadro completo, lo manda subito in broadcast
   UDP sul Wi-Fi di casa (porta 47250). Lo ricevono il Raspberry delle finestrelle e il
   mini PC del TV (pi/sensore.py), che lo passano alla pagina delle finestre.

   Tempo reale (30/10, obiettivo: al massimo 80 ms dal movimento all'immagine):
     · niente code né attese: un quadro arriva, un pacchetto parte (meno di 1 ms);
     · il risparmio energetico del Wi-Fi è SPENTO (WiFi.setSleep(false)): acceso, la
       radio «dorme» fra un pacco e l'altro e aggiunge ritardi di decine di millisecondi;
     · broadcast UDP: nessuna conferma da aspettare; un pacchetto perso è sostituito dal
       prossimo, un decimo di secondo dopo.

   Collegamento (ESP32-C3 Super Mini):
     radar 5V  → 5V        radar GND → G
     radar TX  → pin 20 (RX)          radar RX → pin 21 (TX)
   Alimentazione: USB-C, dall'alimentatore USB.

   Pacchetto (35 byte): "LD24" · id del radar (1 byte) · numero (2 byte) · millis (4 byte) ·
   i 24 byte dei tre bersagli così come li dà il radar.
   ═══════════════════════════════════════════════════════════════════════════ */
#include <WiFi.h>
#include <WiFiUdp.h>

/* ── da scrivere una volta ── */
const char* RETE     = "NOME-DEL-WIFI";
const char* PAROLA   = "PASSWORD-DEL-WIFI";
const uint8_t ID_RADAR = 1;            /* 1 il primo radar, 2 il secondo */

const uint16_t PORTA = 47250;
const int PIN_RX = 20, PIN_TX = 21;

WiFiUDP udp;
uint8_t quadro[30];
int pieno = 0;
uint16_t numero = 0;

void collegati() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                /* ⚠ fondamentale per il tempo reale */
  WiFi.begin(RETE, PAROLA);
  while (WiFi.status() != WL_CONNECTED) delay(200);
}

void setup() {
  Serial1.begin(256000, SERIAL_8N1, PIN_RX, PIN_TX);
  collegati();
  udp.begin(PORTA);
}

void manda() {
  uint8_t p[35];
  memcpy(p, "LD24", 4);
  p[4] = ID_RADAR;
  p[5] = numero & 0xFF; p[6] = numero >> 8; numero++;
  uint32_t ms = millis();
  memcpy(p + 7, &ms, 4);
  memcpy(p + 11, quadro + 4, 24);
  udp.beginPacket(IPAddress(255, 255, 255, 255), PORTA);
  udp.write(p, sizeof(p));
  udp.endPacket();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) collegati();
  while (Serial1.available()) {
    uint8_t c = Serial1.read();
    /* l'inizio di un quadro è AA FF 03 00, la fine 55 CC */
    static const uint8_t TESTA[4] = {0xAA, 0xFF, 0x03, 0x00};
    if (pieno < 4) {
      if (c == TESTA[pieno]) quadro[pieno++] = c;
      else { pieno = 0; if (c == 0xAA) quadro[pieno++] = c; }
      continue;
    }
    quadro[pieno++] = c;
    if (pieno == 30) {
      if (quadro[28] == 0x55 && quadro[29] == 0xCC) manda();
      pieno = 0;
    }
  }
}
