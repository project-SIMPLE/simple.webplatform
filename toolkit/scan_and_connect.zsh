#!/usr/bin/env zsh

# Check if a list of IPs is provided
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <ip1> [<ip2> <ip3> ...]"
  exit 1
fi

# Activate adb server if not yet
adb devices > /dev/null 2>&1

# Get the list of IP addresses from the command line arguments
ip_addresses=("$@")
port_range="30000-49999"

# Loop through each IP address
for ip in "${ip_addresses[@]}"; do
  #echo "Scanning IP address: $ip"

  # Scan ports using nmap, grep for open ports, and extract port numbers
  open_ports=($(nmap -p${port_range} -oG - $ip |
                grep "open" |
                sed -E 's/.*Ports: ([0-9]+)\/.*/\1/'))

  if [[ ${#open_ports[@]} -eq 0 ]]; then
    #echo "  No open ports found in the specified range on $ip."
    echo "ERROR"
  else
    #echo "  Open ports found on $ip:"
    for port in "${open_ports[@]}"; do
      #echo "  - $port"

      # Attempt to connect using adb
      #echo "  Trying to connect with adb to $ip:$port..."
      adb connect $ip:$port
      if [[ $? -eq 0 ]]; then
        #echo "  Successfully connected to $ip:$port"
        echo "OK"
      else
        #echo "  Connection to $ip:$port failed"
        echo "ERROR"
      fi
    done
  fi

  #echo "---------------------"
done

#echo "Display all devices connected to ADB"
#adb devices