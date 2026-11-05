package browser

import (
	"context"
	"encoding/json"
	"testing"
)

func BenchmarkQueryEngine(b *testing.B) {
	b.StopTimer()
	browsers, err := largeSources(b.TempDir(), 100000, 10000)
	if err != nil {
		b.Fatal(err)
	}
	middle, err := HistoryContext(context.Background(), browsers, Query{BrowserID: "chrome", ProfileID: "large", Page: 1000, PageSize: 50, Sort: "asc"})
	if err != nil || middle.NextCursor == nil {
		b.Fatal(err)
	}
	loginMiddle, err := InventoryQueryContext(context.Background(), browsers, Query{BrowserID: "chrome", ProfileID: "large", Page: 100, PageSize: 50, Sort: "asc"})
	if err != nil || loginMiddle.NextCursor == nil {
		b.Fatal(err)
	}
	cases := []struct {
		name      string
		q         Query
		inventory bool
	}{
		{"history_first_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Stream: true}, false},
		{"history_cursor_middle_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Sort: "asc", Cursor: *middle.NextCursor, Stream: true}, false},
		{"history_search_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Search: "needle", Stream: true}, false},
		{"history_offset_middle_50_legacy", Query{BrowserID: "chrome", ProfileID: "large", Page: 1000, PageSize: 50, Sort: "asc"}, false},
		{"inventory_first_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Stream: true}, true},
		{"inventory_cursor_middle_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Sort: "asc", Cursor: *loginMiddle.NextCursor, Stream: true}, true},
		{"inventory_search_50", Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Search: "user-000", Stream: true}, true},
	}
	b.StartTimer()
	for _, test := range cases {
		b.Run(test.name, func(b *testing.B) {
			b.ReportAllocs()
			var result any
			for i := 0; i < b.N; i++ {
				if test.inventory {
					result, err = InventoryQueryContext(context.Background(), browsers, test.q)
				} else {
					result, err = HistoryContext(context.Background(), browsers, test.q)
				}
				if err != nil {
					b.Fatal(err)
				}
			}
			b.StopTimer()
			encoded, _ := json.Marshal(result)
			b.ReportMetric(float64(len(encoded)), "response_bytes")
			b.ReportMetric(50, "rows/op")
		})
	}
}
