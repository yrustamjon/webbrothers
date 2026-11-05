//go:build windows

package traffic

import "context"

func collectConnections(ctx context.Context) ([]Connection, string, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, "", "", err
	}
	return nil, "unsupported", "Windows uchun joriy foydalanuvchi SID bilan tekshirilgan native socket kollektor hali mavjud emas; qurilma jami trafikidan foydalaning", nil
}
