/* ═══════════════════════════════════════════════════════════════════════════
   radar-udp 2.0 — la schedina ESP32-C3 accanto al radar HLK-LD2450.

   Legge il radar dalla seriale e, a OGNI quadro completo, lo manda subito in broadcast
   UDP sul Wi-Fi di casa (porta 47250). Lo riceve il computer del TV (pi/sensore.py: oggi la
   ROG Ally; va bene qualunque computer di casa con Python, Windows o Linux), che lo passa
   alla pagina del TV.

   16/11 · 2.0: nome e password del Wi-Fi NON stanno più nel codice. Si installa dalla pagina
   https://mauriziotarsia-dev.github.io/finestre/radar/ (Chrome o Edge, schedina attaccata col
   cavo USB-C): la pagina carica il programma e poi chiede la rete; li scrive Maurizio, la
   schedina li tiene in memoria (anche staccata dalla corrente). Il dialogo fra pagina e
   schedina è il protocollo «Improv» sulla seriale USB (https://www.improv-wifi.com/serial/).

   La lucina blu (pin 8) dice com'è messa:
     · lampeggia veloce  → cerca il Wi-Fi (o non ha ancora la rete: rifare l'installazione);
     · lampeggia lenta   → Wi-Fi a posto, ma dal radar non arriva niente (un filo staccato o
                           TX/RX scambiati);
     · accesa fissa      → tutto a posto: le letture partono.

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

   Se il broadcast non arriva al computer (Windows che blocca la porta in ingresso, router che non
   inoltra il broadcast), il ricevitore si collega lui alla schedina sulla porta TCP 47251: la schedina
   tiene fino a 4 ricevitori collegati e manda a loro gli stessi pacchetti (il ricevitore scarta i
   doppioni col numero del pacchetto).

   Pacchetto (35 byte): "LD24" · id del radar (1 byte) · numero (2 byte) · millis (4 byte) ·
   i 24 byte dei tre bersagli così come li dà il radar.

   Compilazione: scheda «ESP32C3 Dev Module» con «USB CDC On Boot: Enabled»
   (arduino-cli: esp32:esp32:esp32c3:CDCOnBoot=cdc).
   ═══════════════════════════════════════════════════════════════════════════ */
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include <ESPmDNS.h>

const char* NOME     = "Radar DMaster Atmosphere";   /* uguale al «name» di radar/manifest.json */
const char* VERSIONE = "2.0";
const uint8_t ID_RADAR = 1;            /* 1 il primo radar, 2 il secondo */

const uint16_t PORTA = 47250, PORTA_TCP = 47251;
const int PIN_RX = 20, PIN_TX = 21, PIN_LUCE = 8;   /* la lucina blu della Super Mini si accende a LOW */

WiFiUDP udp;
WiFiServer servizio(PORTA_TCP);
WiFiClient ricevitori[4];
Preferences memoria;
String rete, parola;
bool udpAperto = false;
uint32_t tentativo = 0, ultimoQuadro = 0;

uint8_t quadro[30];
int pieno = 0;
uint16_t numero = 0;

/* ── Wi-Fi ─────────────────────────────────────────────────────────────────── */
void accendiRadio() {
  WiFi.persistent(false);              /* la rete la teniamo noi in «memoria» */
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("radar-dmaster");
  WiFi.setSleep(false);                /* ⚠ fondamentale per il tempo reale */
}

void collegati(const String& r, const String& p) {
  WiFi.disconnect();
  WiFi.begin(r.c_str(), p.c_str());
  /* ⚠ molte ESP32-C3 Super Mini hanno l'antenna troppo vicina al quarzo e a piena potenza non si
     collegano: con 8,5 dBm sì. In casa basta e avanza. */
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.setSleep(false);
  tentativo = millis();
}

void curaWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!udpAperto) { udp.begin(PORTA); servizio.begin(); servizio.setNoDelay(true); MDNS.begin("radar-dmaster"); udpAperto = true; }
    WiFiClient nuovo = servizio.accept();
    if (nuovo) {
      int k = 0;                                       /* un posto libero, se no il primo */
      for (int i = 0; i < 4; i++) if (!ricevitori[i].connected()) { k = i; break; }
      ricevitori[k].stop();
      ricevitori[k] = nuovo;
      ricevitori[k].setNoDelay(true);
    }
    return;
  }
  if (rete.length() && millis() - tentativo > 15000) collegati(rete, parola);
}

/* ── Improv: la pagina d'installazione dà nome e password del Wi-Fi ───────────── */
enum { STATO = 0x01, ERRORE = 0x02, RPC = 0x03, RISULTATO = 0x04 };
enum { PRONTA = 0x02, IN_CORSO = 0x03, COLLEGATA = 0x04 };

void improvManda(uint8_t tipo, const uint8_t* d, uint8_t n) {
  uint8_t p[300];
  int k = 0;
  memcpy(p, "IMPROV", 6); k = 6;
  p[k++] = 1; p[k++] = tipo; p[k++] = n;
  memcpy(p + k, d, n); k += n;
  uint8_t s = 0;
  for (int i = 0; i < k; i++) s += p[i];
  p[k++] = s;
  p[k++] = '\n';
  Serial.write(p, k);
  Serial.flush();
}
void improvStato(uint8_t s) { improvManda(STATO, &s, 1); }
void improvErrore(uint8_t e) { improvManda(ERRORE, &e, 1); }
void improvRisultato(uint8_t comando, const String* v, int quante) {
  uint8_t d[256];
  int k = 2;
  for (int i = 0; i < quante; i++) {
    int n = min((int)v[i].length(), 60);
    d[k++] = n; memcpy(d + k, v[i].c_str(), n); k += n;
  }
  d[0] = comando; d[1] = k - 2;
  improvManda(RISULTATO, d, k);
}

void improvComando(const uint8_t* d, uint8_t n) {
  if (n < 2) { improvErrore(0x01); return; }
  uint8_t comando = d[0], lun = d[1];
  const uint8_t* p = d + 2;
  if (lun + 2 > n) { improvErrore(0x01); return; }

  if (comando == 0x01) {                               /* ecco la rete */
    uint8_t ln = p[0];
    if (1 + ln + 1 > lun) { improvErrore(0x01); return; }
    String r;
    for (int i = 0; i < ln; i++) r += (char)p[1 + i];
    uint8_t lp = p[1 + ln];
    String w;
    for (int i = 0; i < lp && 2 + ln + i < lun; i++) w += (char)p[2 + ln + i];
    improvErrore(0x00);
    improvStato(IN_CORSO);
    collegati(r, w);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
      digitalWrite(PIN_LUCE, (millis() / 100) % 2 ? LOW : HIGH);
      delay(50);
    }
    if (WiFi.status() == WL_CONNECTED) {
      rete = r; parola = w;
      memoria.putString("rete", rete);
      memoria.putString("parola", parola);
      improvStato(COLLEGATA);
      improvRisultato(0x01, nullptr, 0);
    } else {
      improvErrore(0x03);                              /* non riesce a collegarsi */
      improvStato(PRONTA);
      if (rete.length()) collegati(rete, parola);      /* torna alla rete di prima, se c'era */
    }
    return;
  }
  if (comando == 0x02) {                               /* com'è messa? */
    bool ok = WiFi.status() == WL_CONNECTED;
    improvStato(ok ? COLLEGATA : PRONTA);
    if (ok) improvRisultato(0x02, nullptr, 0);
    return;
  }
  if (comando == 0x03) {                               /* chi sei? */
    String v[4] = {NOME, VERSIONE, "ESP32-C3", String("Radar ") + ID_RADAR};
    improvRisultato(0x03, v, 4);
    return;
  }
  if (comando == 0x04) {                               /* che reti vedi? */
    if (WiFi.status() != WL_CONNECTED) WiFi.disconnect();
    int quante = WiFi.scanNetworks();
    for (int i = 0; i < quante && i < 20; i++) {
      if (!WiFi.SSID(i).length()) continue;
      String v[3] = {WiFi.SSID(i), String(WiFi.RSSI(i)), WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "NO" : "YES"};
      improvRisultato(0x04, v, 3);
    }
    WiFi.scanDelete();
    improvRisultato(0x04, nullptr, 0);
    if (WiFi.status() != WL_CONNECTED && rete.length()) collegati(rete, parola);
    return;
  }
  improvErrore(0x02);                                  /* comando sconosciuto */
}

uint8_t ib[300];
int in = 0;
void leggiImprov() {
  while (Serial.available()) {
    uint8_t c = Serial.read();
    if (in < 6) {                                      /* l'inizio di un pacchetto è «IMPROV» */
      if (c == (uint8_t)"IMPROV"[in]) ib[in++] = c;
      else { in = 0; if (c == 'I') ib[in++] = c; }
      continue;
    }
    ib[in++] = c;
    if (in >= 9) {                                     /* IMPROV · versione · tipo · lunghezza */
      int fine = 9 + ib[8] + 1;
      if (in == fine) {
        uint8_t s = 0;
        for (int i = 0; i < in - 1; i++) s += ib[i];
        if (s != ib[in - 1]) improvErrore(0x01);
        else if (ib[7] == RPC) improvComando(ib + 9, ib[8]);
        in = 0;
      }
    }
    if (in >= (int)sizeof(ib)) in = 0;
  }
}

/* ── radar ─────────────────────────────────────────────────────────────────── */
void manda() {
  ultimoQuadro = millis();
  if (WiFi.status() != WL_CONNECTED) return;
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
  for (int i = 0; i < 4; i++)
    if (ricevitori[i].connected()) ricevitori[i].write(p, sizeof(p));
}

void leggiRadar() {
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

void luce() {
  uint32_t t = millis();
  bool accesa;
  if (WiFi.status() != WL_CONNECTED) accesa = (t / 100) % 2;          /* veloce: cerca il Wi-Fi */
  else if (t - ultimoQuadro > 1500) accesa = (t / 500) % 2;           /* lenta: il radar tace */
  else accesa = true;                                                 /* fissa: tutto a posto */
  digitalWrite(PIN_LUCE, accesa ? LOW : HIGH);
}

void setup() {
  pinMode(PIN_LUCE, OUTPUT);
  digitalWrite(PIN_LUCE, HIGH);
  Serial.begin(115200);                /* la seriale USB: solo per la pagina d'installazione */
  Serial1.begin(256000, SERIAL_8N1, PIN_RX, PIN_TX);
  memoria.begin("radar", false);
  rete = memoria.getString("rete", "");
  parola = memoria.getString("parola", "");
  accendiRadio();
  if (rete.length()) collegati(rete, parola);
}

void loop() {
  leggiImprov();
  curaWifi();
  leggiRadar();
  luce();
}
