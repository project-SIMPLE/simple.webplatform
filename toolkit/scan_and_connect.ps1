param(
  [string]$port_range = "30000-49999",
  [string]$ip_adresses
)

$DebugPreference = "Continue" #variable used to specify the level of verbosity of debug messages         
# change to SilentlyContinue to remove them

#function checking if a given IP adress is valid by comparing it's input to a RegEx pattern
function is_ip_valid($ip) {
  $ip -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
}


&adb start-server #starts the adb server
if ($ip_adresses -eq 0) {
  Write-Debug "No IP addresses provided"
  exit 1
}
foreach ($ip in $ip_adresses) {
  if (-not (is_ip_valid $ip)) {
    Write-Debug "$ip is not a valid IP address"
    continue
  }
  else {
    Write-Debug "Scanning $ip for open ports in range with nmap"
    #open_ports is considered a list, even though empirically only a single port is returned
    $open_ports = (&nmap -p $port_range -oG - $ip_adresses ) | Select-String -Pattern "open" | ForEach-Object { $PSItem -replace ".*Ports: (\d+)/.*", '$1' }
    #checks if the list is empty
    if (-not $open_ports) {
      Write-Host "ERROR. couldn't find a suitable port on ip:$ip"
    }
    else {
      Write-Host "Found open ports: $open_ports"
      foreach ($port in $open_ports) {
        Write-Debug "Connecting to $ip on port $port"
        &adb connect ${ip}:${port} > $null
        
      } 
      
        
      Write-Host("OK") #this is what is read back by the device finder, it ignores exit codes other than 0
    }
  }
}
  


