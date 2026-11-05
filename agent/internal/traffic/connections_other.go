//go:build !windows && !darwin && !linux

package traffic

import "context"

func collectConnections(ctx context.Context) ([]Connection, string, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, "", "", err
	}
	return nil, "unsupported", "Ushbu OS uchun xavfsiz socket kollektor mavjud emas", nil
}
