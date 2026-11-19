#!/usr/bin/env python3
"""Download the latest SIMPLE GAMA plugin (plugin + feature jars) from its p2 site into a dropins folder.

Usage: p2Downloader.py <p2 site url> <dropins folder>

Every request is retried on transient failures (HTTP 5xx / 429, network errors): the
project-simple.github.io site has answered 503 to CI before, and a missing plugin then
surfaced as unrelated GAML compile errors in the tests. If the jars still can't be
downloaded, the script exits non-zero with a clear CI error instead of carrying on.
"""
import xml.etree.ElementTree as ET
import sys
import os
import time
import zipfile

import urllib.request
import urllib.error

ATTEMPTS = 6
# Seconds before each retry: 5 + 10 + 20 + 40 + 60 = over two minutes of waiting in total
RETRY_DELAYS = [5, 10, 20, 40, 60]


def is_transient(error):
	if isinstance(error, urllib.error.HTTPError):
		return error.code >= 500 or error.code == 429
	# URLError (DNS, refused, reset), timeouts, truncated reads
	return isinstance(error, (urllib.error.URLError, TimeoutError, ConnectionError, OSError))


def fetch(url):
	"""Returns the body of `url`, retrying transient failures; raises the last error."""
	for attempt in range(1, ATTEMPTS + 1):
		try:
			with urllib.request.urlopen(url, timeout=60) as response:
				return response.read()
		except Exception as e:
			if attempt == ATTEMPTS or not is_transient(e):
				raise
			delay = RETRY_DELAYS[attempt - 1]
			print(f"\t{url}: {e} (attempt {attempt}/{ATTEMPTS}), retrying in {delay} s", flush=True)
			time.sleep(delay)


def fail(message):
	print(f"::error::SIMPLE GAMA plugin install failed: {message}", flush=True)
	sys.exit(1)


def download_jar(jarUrl, outputJarName):
	outputPath = os.path.join(sys.argv[2], outputJarName)

	print("Downloading jar:")
	print(f"\tSource: {jarUrl}")
	print(f"\tAs file: {outputJarName}")
	print(f"\tAt position: {outputPath}")

	data = fetch(jarUrl)
	# A jar is a zip: an HTML error page served with a 200 would otherwise install silently
	tmpPath = outputPath + ".part"
	with open(tmpPath, "wb") as f:
		f.write(data)
	if not zipfile.is_zipfile(tmpPath):
		os.remove(tmpPath)
		raise ValueError(f"{jarUrl} is not a jar ({len(data)} bytes)")
	os.replace(tmpPath, outputPath)
	print(f"Downloaded: {outputJarName} ({len(data)} bytes)")


def downloadPluginNFeatureJar(url):
	downloadVersionNumber = url.split('/')[-1]

	pluginName = "gaml.extension.unity_" + downloadVersionNumber + ".jar"
	featureName = "gaml.feature.unity_" + downloadVersionNumber + ".jar"

	download_jar(url + "/plugins/" + pluginName, pluginName)
	download_jar(url + "/features/" + featureName, featureName)


def getSubP2Folder(rootUrl):
	compositeUrl = rootUrl.replace("/p2.index", "/compositeContent.xml")
	data = fetch(compositeUrl).decode('utf-8')

	root = ET.fromstring(data)
	children_element = root.find('children')
	last_child = children_element.findall('child')[-1]  # Get last child

	return rootUrl.replace("/p2.index", "/" + last_child.get('location') + "/p2.index")


def exploreP2Level(url):
	# Walk down the composite repositories (always the last, newest child) to the jars
	while True:
		data = fetch(url).decode('utf-8')
		if "composite" not in data:
			downloadPluginNFeatureJar(url.replace("/p2.index", ""))
			return
		url = getSubP2Folder(url)

# ======================

# 'https://project-simple.github.io/simple.toolchain/p2.index'

if len(sys.argv) != 3:
	print("usage: p2Downloader.py <p2 site url> <dropins folder>")
	sys.exit(2)

baseUrl = sys.argv[1]
if ("p2.index" not in baseUrl):
	baseUrl += "/p2.index"


print("Download URL: " + baseUrl)
print("Destination folder: " + sys.argv[2])

if not os.path.exists(sys.argv[2]):
	os.makedirs(sys.argv[2])
	print(f"Created: {sys.argv[2]}")
else:
	print(f"Already exists: {sys.argv[2]}")

try:
	exploreP2Level(baseUrl)
except Exception as e:
	fail(f"{type(e).__name__}: {e}")
