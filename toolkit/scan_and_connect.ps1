$DebugPreference = "Continue" #variable used to specify the level of verbosity of debug messages         
# change to SilentlyContinue to remove them

#function checking if a given IP adress is valid by comparing it's input to a RegEx pattern
function is_ip_valid($ip) {
  $ip -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
}

function scan_and_connect {
  param(
    [string]$ip_adresses,
    [string]$port_range = "30000-49999"
  )

  &adb start-server #starts the adb server
  if($ip_adresses -eq 0) {
    Write-Debug "No IP addresses provided"
    return
  }
  
  foreach ($ip in $ip_adresses) {
    if (-not (is_ip_valid $ip)) {
      Write-Debug "$ip is not a valid IP address"
      continue
    }
    else {
      Write-Debug "Scanning $ip for open ports in range with nmap"
      #open_ports is considered a list, even though empirically only a single port is returned
      $open_ports = (&nmap -p $port_range -oG - 10.2.98.198) | Select-String -Pattern "open" | ForEach-Object { $PSItem -replace ".*Ports: (\d+)/.*", '$1' }
      #checks if the list is empty
      if ($open_ports -eq 0) {
        Write-Error "No open ports found on $ip"
      }
      else {
        foreach ($port in $open_ports) {
          Write-Debug "Connecting to $ip on port $port"
          &adb connect ${ip}:${port}
        }
      }
    }
  }
}


