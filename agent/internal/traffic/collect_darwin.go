//go:build darwin

package traffic

func Collect() (Stats, error) {
	output, err := counterCommand("/usr/sbin/netstat", "-ibn")
	if err != nil {
		return Stats{}, err
	}
	return parseDarwin(output)
}
