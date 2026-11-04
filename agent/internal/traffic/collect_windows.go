//go:build windows && cgo

package traffic

/*
#cgo CFLAGS: -D_WIN32_WINNT=0x0600
#cgo LDFLAGS: -liphlpapi
#include <winsock2.h>
#include <windows.h>
#include <iphlpapi.h>
#include <netioapi.h>
#include <stdint.h>

// Use the SDK's native structure layout, not hard-coded offsets or a shell.
// Only octet totals cross the C/Go boundary; no interface identities leave here.
static DWORD bmp_traffic_totals(uint64_t *received, uint64_t *sent) {
    MIB_IF_TABLE2 *table = NULL;
    DWORD status = GetIfTable2(&table);
    if (status != NO_ERROR) return status;
    if (table == NULL) return ERROR_INVALID_DATA;
    uint64_t incoming = 0, outgoing = 0;
    ULONG count = 0;
    for (ULONG index = 0; index < table->NumEntries; index++) {
        MIB_IF_ROW2 *row = &table->Table[index];
        if (row->Type == IF_TYPE_SOFTWARE_LOOPBACK) continue;
        if (row->InOctets > UINT64_MAX-incoming || row->OutOctets > UINT64_MAX-outgoing) {
            FreeMibTable(table);
            return ERROR_ARITHMETIC_OVERFLOW;
        }
        incoming += row->InOctets;
        outgoing += row->OutOctets;
        count++;
    }
    FreeMibTable(table);
    if (count == 0) return ERROR_NO_DATA;
    *received = incoming;
    *sent = outgoing;
    return NO_ERROR;
}
*/
import "C"

import "errors"

func Collect() (Stats, error) {
	var received, sent C.uint64_t
	if C.bmp_traffic_totals(&received, &sent) != 0 {
		return Stats{}, errors.New("Windows trafik hisoblagichlarini oʻqib boʻlmadi")
	}
	stats := totals()
	stats.Received, stats.Sent = uint64(received), uint64(sent)
	return stats, nil
}
