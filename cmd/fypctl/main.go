package main

import (
	"os"

	"github.com/fyp-portal/installer/internal/operations"
)

func main() {
	os.Exit(operations.Run("fypctl", os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
