#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

print_error() {
  printf 'FZ Terminal installer: %s\n' "$*" >&2
}

find_latest_package() {
  local search_directory
  local -a packages=()
  for search_directory in "$SCRIPT_DIR" "$SCRIPT_DIR/release"; do
    [[ -d "$search_directory" ]] || continue
    while IFS= read -r package; do
      packages+=("$package")
    done < <(
      find "$search_directory" -maxdepth 1 -type f \
        -name 'FZ-Terminal-*-amd64.deb' -print
    )
  done

  ((${#packages[@]} > 0)) || return 1
  printf '%s\n' "${packages[@]}" | sort -V | tail -n 1
}

requested_package="${1:-}"
if [[ -n "$requested_package" ]]; then
  [[ -f "$requested_package" ]] || {
    print_error "package not found: $requested_package"
    exit 1
  }
  package_path="$(realpath -- "$requested_package")"
else
  package_path="$(find_latest_package)" || {
    print_error "no FZ-Terminal-*-amd64.deb package was found."
    print_error "Keep this installer next to the DEB file and run it again."
    exit 1
  }
  package_path="$(realpath -- "$package_path")"
fi

command -v dpkg-deb >/dev/null 2>&1 || {
  print_error "dpkg-deb is required to validate the package."
  exit 1
}
apt_get="$(command -v apt-get)" || {
  print_error "apt-get is required to install the package."
  exit 1
}

package_name="$(dpkg-deb --field "$package_path" Package)"
package_version="$(dpkg-deb --field "$package_path" Version)"
package_architecture="$(dpkg-deb --field "$package_path" Architecture)"
system_architecture="$(dpkg --print-architecture)"

[[ "$package_name" == "fz-terminal" ]] || {
  print_error "unexpected package name: $package_name"
  exit 1
}

[[ "$package_architecture" == "$system_architecture" ]] || {
  print_error \
    "package architecture $package_architecture does not match $system_architecture."
  exit 1
}

printf 'Installing FZ Terminal %s from:\n%s\n\n' \
  "$package_version" "$package_path"

install_command=("$apt_get" install -y "$package_path")
if ((EUID == 0)); then
  "${install_command[@]}"
elif [[ -t 0 ]] && command -v sudo >/dev/null 2>&1; then
  sudo "${install_command[@]}"
elif command -v pkexec >/dev/null 2>&1; then
  pkexec "${install_command[@]}"
elif command -v sudo >/dev/null 2>&1; then
  sudo "${install_command[@]}"
else
  print_error "administrator authorization is required."
  print_error "Run: sudo apt-get install \"$package_path\""
  exit 1
fi

installed_version="$(
  dpkg-query --show --showformat='${Version}' "$package_name" 2>/dev/null || true
)"
if [[ "$installed_version" != "$package_version" ]]; then
  print_error "installation did not complete successfully."
  exit 1
fi

printf '\nFZ Terminal %s installed successfully.\n' "$installed_version"
printf 'Launch it from the application menu or run: fz-terminal\n'
