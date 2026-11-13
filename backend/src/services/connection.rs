use local_ip_address::list_afinet_netifas;
use qrcode::QrCode;
use qrcode::render::unicode;

pub struct ConnectionInfo {
    pub hostname: String,
    pub ips: Vec<String>,
    pub port: u16,
}

impl ConnectionInfo {
    fn web_connect_origin(&self) -> String {
        if let Ok(origin) = std::env::var("PI_UI_WEB_ORIGIN") {
            let trimmed = origin.trim().trim_end_matches('/');
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if cfg!(debug_assertions) {
            "http://localhost:8081".to_string()
        } else {
            format!("http://localhost:{}", self.port)
        }
    }

    pub fn gather(port: u16) -> Self {
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        let mut ips = list_afinet_netifas()
            .map(|ifaces| {
                ifaces
                    .into_iter()
                    .filter(|(name, ip)| {
                        !ip.is_loopback()
                            && !name.starts_with("docker")
                            && !name.starts_with("br-")
                            && !name.starts_with("veth")
                    })
                    .map(|(_, ip)| ip.to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if !ips.iter().any(|ip| ip == "localhost") {
            ips.push("localhost".to_string());
        }

        Self { hostname, ips, port }
    }

    /// Relay fallback URL for when the phone isn't on the same WiFi (expert-ai-link's
    /// HTTP tunnel — see expert-ai-link/src/index.js's PairingRoom.handleTunnelRequest).
    /// Set by Expert AI Agent when it spawns this process, using its own stable
    /// pairing code — unrelated to `qr_id`, which rotates per pairing session.
    fn relay_url() -> Option<String> {
        std::env::var("EXPERT_AI_RELAY_URL").ok().filter(|s| !s.trim().is_empty())
    }

    pub fn deep_link(&self, qr_id: &str, server_id: &str) -> String {
        let ips_joined = self.ips.join(",");
        let base = format!(
            "pi://connect?hostname={}&ips={}&port={}&qr_id={}&server_id={}",
            self.hostname, ips_joined, self.port, qr_id, server_id
        );
        match Self::relay_url() {
            Some(relay) => format!("{}&relay={}", base, percent_encode_query_value(&relay)),
            None => base,
        }
    }

    pub fn web_connect_url(&self, qr_id: &str, server_id: &str) -> String {
        let ips_joined = self.ips.join(",");
        format!(
            "{}/connect?hostname={}&ips={}&port={}&qr_id={}&server_id={}",
            self.web_connect_origin(),
            self.hostname,
            ips_joined,
            self.port,
            qr_id,
            server_id
        )
    }

    pub fn print_qr(&self, qr_id: &str, server_id: &str) {
        let deep_link = self.deep_link(qr_id, server_id);
        let web_connect_url = self.web_connect_url(qr_id, server_id);
        let code = match QrCode::new(&deep_link) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("Failed to generate QR code: {e}");
                return;
            }
        };

        let qr_string = code
            .render::<unicode::Dense1x2>()
            .dark_color(unicode::Dense1x2::Light)
            .light_color(unicode::Dense1x2::Dark)
            .build();

        println!();
        println!("  Scan to connect:");
        println!();
        for line in qr_string.lines() {
            println!("  {line}");
        }
        println!();
        println!("  Mobile deep link:");
        println!("  {deep_link}");
        println!();
        println!("  Direct login URL:");
        println!("  {web_connect_url}");
        println!();
    }
}

/// Minimal percent-encoding for a query-string value. Only handles the bytes that
/// actually appear in EXPERT_AI_RELAY_URL (an https:// URL) — not a general-purpose
/// encoder, deliberately, to avoid pulling in a new crate for one call site.
fn percent_encode_query_value(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
