#!/usr/bin/env zsh

# Check if a list of IPs is provided
if [[ $# -eq 0 ]]; then
	echo "Usage: $0 <ip1> [<ip2> <ip3> ...]"
	exit 1
fi

# Loop through the arguments
for arg in "$@"; do
	if [[ "$arg" == "-v" ]]; then
		echo "[Verbose mode enabled]"
		verbose=true
	elif [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		ip_addresses+=("$arg")
	else
		echo "WARN: Unknown argument: $arg"
	fi
done

# Activate adb server if not yet
if [[ $verbose == true ]]; then
	echo "I: Activate ADB server"
fi
adb devices > /dev/null 2>&1

# Get the list of IP addresses from the command line arguments
port_range="30000-49999,5555"

# Change name if
if [[ "$os_name" == "Darwin" ]]; then
	nmapBin="/opt/homebrew/bin/nmap"
else
	nmapBin=$(which nmap);
fi

# sudo echo "$USER ALL=(ALL) NOPASSWD: /opt/homebrew/bin/nmap" > /private/etc/sudoers.d/nmapSIMPLE
testSudoNmap=$(sudo -n $nmapBin --help 2>&1)
if [[ $? -eq 0 ]]; then
	if [[ $verbose == true ]]; then
		echo "I: Using fastest port-knocking by building low-level raw packages with 'sudo' access"
	fi

	nmapBin="sudo $nmapBin -sS"
else
	if [[ $verbose == true ]]; then
		echo "WARN: No sudo access for nmap, using slower fallback scan method"
	fi
fi
nmapBin=${nmapBin//\'/} # Remove single quotes

# Loop through each IP address
for ip in "${ip_addresses[@]}"; do

	# Check if device is already connected
	if adb devices | grep -q $ip ; then
		if [[ $verbose == true ]]; then
			echo "I: Device $ip already connected to ADB server"
		fi
		echo "OK"
	else
		# Run scan as device is not already connected
		if [[ $verbose == true ]]; then
			echo "I: Scanning IP address: $ip"
		fi

		# Scan ports using nmap, grep for open ports, and extract port numbers
		open_ports=($(eval ${nmapBin} -T5 -Pn --min-rate 5000 --max-retries 1 --max-scan-delay 0 --open -p${port_range} -oG - $ip |
									grep "Ports" |
									sed -E 's/.*Ports: ([0-9]+).*/\1/'))

		if [[ ${#open_ports[@]} -eq 0 ]] || [[ ${open_ports[@]} =~ Host.* ]]; then
			if [[ $verbose == true ]]; then
				echo "WARN: No open ports found in the specified range on $ip."
				echo "WARN: $open_ports"
			fi
			echo "ERROR"
		else
			if [[ $verbose == true ]]; then
				echo "I: Open ports found on $ip:"
			fi
			for port in "${open_ports[@]}"; do
				if [[ $verbose == true ]]; then
					echo "I: - $port"

					echo "I: Trying to connect with adb to $ip:$port..."
				fi

				# Attempt to connect using adb
				connectionSuccess=$(adb connect $ip:$port)
				if [[ ! $connectionSuccess =~ ^failed.* ]]; then
					if [[ $verbose == true ]]; then
						echo "I: Successfully connected to $ip:$port"
					fi

					echo "OK"
				else
					if [[ $verbose == true ]]; then
						echo "I: Connection to $ip:$port failed"
					fi

					echo "ERROR"
				fi
			done
		fi
	fi

#echo "---------------------"
done
