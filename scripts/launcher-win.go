package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
)

// Self-extracting launcher for the Simple WebPlatform Windows binary.
//
// Bundle layout (written by build-sea-win.mjs):
//   [this launcher exe] [node.exe bytes] [8-byte size LE] [4-byte magic "SWPN"]
//
// On first launch the embedded node.exe is extracted to a temp folder keyed by
// size and reused on subsequent launches.  The worker MUST be named "node.exe" —
// Windows applies an AppCompat shim to that name required for uWebSockets.js.

const magic = "SWPN"
const footerSize = 12

func main() {
	nodePath, err := extractNode()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[simple] Fatal: %v\n", err)
		os.Exit(1)
	}

	// Ignore Ctrl+C in the launcher — node.exe is in the same console group and
	// will receive it directly, handling its own graceful shutdown.
	signal.Ignore(os.Interrupt)

	cmd := exec.Command(nodePath, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		os.Exit(1)
	}
}

func extractNode() (string, error) {
	selfPath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot find own executable: %w", err)
	}

	f, err := os.Open(selfPath)
	if err != nil {
		return "", fmt.Errorf("cannot open self: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", err
	}
	totalLen := stat.Size()
	if totalLen < int64(footerSize) {
		return "", fmt.Errorf("no embedded payload")
	}

	// Read footer without moving the read cursor (ReadAt is pread).
	footer := make([]byte, footerSize)
	if _, err := f.ReadAt(footer, totalLen-int64(footerSize)); err != nil {
		return "", err
	}
	if string(footer[8:12]) != magic {
		return "", fmt.Errorf("magic not found — binary may not be bundled")
	}

	embeddedSize := int64(binary.LittleEndian.Uint64(footer[0:8]))
	embeddedStart := totalLen - int64(footerSize) - embeddedSize
	if embeddedStart < 0 || embeddedSize <= 0 {
		return "", fmt.Errorf("invalid embedded size %d", embeddedSize)
	}

	// Cache directory keyed by embedded size — a new build always has a different size.
	tempDir := filepath.Join(os.TempDir(), "swp-node-"+strconv.FormatInt(embeddedSize, 16))
	nodePath := filepath.Join(tempDir, "node.exe")

	if info, err := os.Stat(nodePath); err == nil && info.Size() == embeddedSize {
		return nodePath, nil // cache hit
	}

	fmt.Fprintln(os.Stderr, "[simple] First launch: extracting runtime, please wait...")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create temp dir: %w", err)
	}

	tmpOut := nodePath + ".tmp"
	outF, err := os.Create(tmpOut)
	if err != nil {
		return "", fmt.Errorf("cannot create output file: %w", err)
	}

	if _, err := f.Seek(embeddedStart, io.SeekStart); err != nil {
		outF.Close()
		os.Remove(tmpOut)
		return "", err
	}
	if _, err := io.CopyN(outF, f, embeddedSize); err != nil {
		outF.Close()
		os.Remove(tmpOut)
		return "", fmt.Errorf("extraction failed: %w", err)
	}
	outF.Close()

	// Atomic rename so a partial extraction is never used on the next launch.
	os.Remove(nodePath)
	if err := os.Rename(tmpOut, nodePath); err != nil {
		os.Remove(tmpOut)
		return "", fmt.Errorf("cannot finalize extraction: %w", err)
	}

	return nodePath, nil
}
