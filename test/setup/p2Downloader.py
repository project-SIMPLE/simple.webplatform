#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import sys
import os

import urllib.request
import urllib.parse
import urllib.error

def download_jar(jarUrl, outputJarName):
	outputPath = sys.argv[2] + "/" + outputJarName

	print("Downloading jar:")
	print(f"\tSource: {jarUrl}")
	print(f"\tAs file: {outputJarName}")
	print(f"\tAt position: {outputPath}")

	try:
		urllib.request.urlretrieve(jarUrl, outputPath)
		print(f"Downloaded: {outputJarName}")
	except urllib.error.URLError as e:
		print(f"Download failed: {e}")
	except Exception as e:
		print(f"Error: {e}")

def downloadPluginNFeatureJar(url):
	downloadVersionNumber = url.split('/')[-1]

	pluginName = "gaml.extension.unity_" + downloadVersionNumber + ".jar"
	featureName = "gaml.feature.unity_" + downloadVersionNumber + ".jar"

	pluginURL = url + "/plugins/" + pluginName
	featureURL = url + "/features/" + featureName

	# print("Plugin: " + pluginURL)
	# print("Feature: " + featureURL)

	download_jar(pluginURL, pluginName)
	download_jar(featureURL, featureName)


def getSubP2Folder(data, rootUrl):
	compositeUrl = rootUrl.replace("/p2.index", "/compositeContent.xml")
	response = urllib.request.urlopen(compositeUrl)
	data = response.read().decode('utf-8')

	root = ET.fromstring(data)
	children_element = root.find('children')
	last_child = children_element.findall('child')[-1]  # Get last child

	return rootUrl.replace("/p2.index", "/" + last_child.get('location') + "/p2.index")

def exploreP2Level(url):
	rootUrl = url

	response = urllib.request.urlopen(rootUrl)
	data = response.read().decode('utf-8')

	if ("composite" in data):
		# print("Going deeper...")
		rootUrl = getSubP2Folder(data, rootUrl) 
	else: 
		# print("Reaching jars !")
		downloadPluginNFeatureJar(rootUrl.replace("/p2.index", ""))

	# Loop
	if (rootUrl != url):
		exploreP2Level(rootUrl)

# ======================

# 'https://project-simple.github.io/simple.toolchain/p2.index'

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

exploreP2Level(baseUrl)