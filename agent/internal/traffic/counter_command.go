package traffic

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os/exec"
	"time"
)

type counterOutput struct{ bytes.Buffer }

func (w *counterOutput) Write(p []byte) (int, error) {
	if w.Len()+len(p) > 256*1024 {
		return 0, errors.New("counter output too large")
	}
	return w.Buffer.Write(p)
}

func counterCommand(program string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, program, args...)
	cmd.WaitDelay = time.Second
	var output counterOutput
	cmd.Stdout = &output
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return nil, errors.New("OS trafik hisoblagichlarini oʻqib boʻlmadi")
	}
	return output.Bytes(), nil
}
