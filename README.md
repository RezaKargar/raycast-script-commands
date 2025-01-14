# Raycast Script Commands

This repository contains a set of shell scripts designed to be used with Raycast, a productivity tool for macOS. These scripts provide various utilities, including DNS management and terminal operations.

## Scripts

### List DNS

Lists the current DNS provider if any is set.

- **File:** [dns/list-dns.sh](dns/list-dns.sh)
- **Usage:** `./dns/list-dns.sh`

### Set DNS

Sets the DNS to a specified provider.

- **File:** [dns/set-dns.sh](dns/set-dns.sh)
- **Usage:** `./dns/set-dns.sh [provider]`
- **Providers:** `shecan` (default), `begzar`, `bogzar`, `403`

### Remove DNS

Removes custom DNS settings and resets to automatic.

- **File:** [dns/remove-dns.sh](dns/remove-dns.sh)
- **Usage:** `./dns/remove-dns.sh`

### Open Terminal

Opens the Warp terminal application.

- **File:** [terminal.sh](terminal.sh)
- **Usage:** `./terminal.sh`

## Author

- **Reza Kargar**
- **Website:** [https://rezakargar.ir](https://rezakargar.ir)

## License

This project is licensed under the MIT License.