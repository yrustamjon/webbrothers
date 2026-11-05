package main

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"
	"webbrothers/agent/internal/protocol"
)

func TestStreamWaitsForAckAndCancellation(t *testing.T) {
	g := newTaskGroup(context.Background(), 1)
	defer g.close()
	m := protocol.Message{RequestID: "r", ExpiresAt: time.Now().Add(time.Second)}
	sent := make(chan protocol.Message, 4)
	done := make(chan error, 1)
	if e := g.start(m, func(task *streamTask) {
		for n := 0; n < 2; n++ {
			if e := task.send(m, n, false, map[string]any{"items": []int{n}}, func(v any) error { sent <- v.(protocol.Message); return nil }); e != nil {
				done <- e
				return
			}
		}
		done <- nil
	}); e != nil {
		t.Fatal(e)
	}
	<-sent
	select {
	case <-sent:
		t.Fatal("sent without ACK")
	case <-time.After(20 * time.Millisecond):
	}
	seq := 0
	if e := g.control(protocol.Message{Type: "STREAM_ACK", RequestID: "r", Sequence: &seq}); e != nil {
		t.Fatal(e)
	}
	<-sent
	if e := g.control(protocol.Message{Type: "CANCEL_REQUEST", RequestID: "r"}); e != nil {
		t.Fatal(e)
	}
	if e := <-done; e != context.Canceled {
		t.Fatal(e)
	}
}
func TestTaskConcurrencyBoundAndCleanup(t *testing.T) {
	g := newTaskGroup(context.Background(), 1)
	var active atomic.Int32
	if e := g.start(protocol.Message{RequestID: "one", ExpiresAt: time.Now().Add(time.Second)}, func(task *streamTask) { active.Add(1); <-task.ctx.Done(); active.Add(-1) }); e != nil {
		t.Fatal(e)
	}
	if e := g.start(protocol.Message{RequestID: "two", ExpiresAt: time.Now().Add(time.Second)}, func(*streamTask) {}); e == nil {
		t.Fatal("unbounded requests")
	}
	g.close()
	if active.Load() != 0 {
		t.Fatal("worker leak")
	}
}
func TestStreamChunksBoundedAndCorrelated(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	task := &streamTask{ctx: ctx, cancel: cancel, ack: make(chan int, 1), waiting: -1}
	items := make([]map[string]string, 50)
	for i := range items {
		items[i] = map[string]string{"title": "synthetic"}
	}
	count, rows := 0, 0
	e := streamPages(task, protocol.Message{Type: "HISTORY_QUERY", RequestID: "safe"}, map[string]any{"items": items, "page_size": 50, "has_more": false, "next_cursor": nil}, func(v any) error {
		m := v.(protocol.Message)
		b, _ := json.Marshal(m)
		if len(b) > protocol.MaxStreamFrame || m.RequestID != "safe" || *m.Sequence != count {
			t.Error("invalid frame")
		}
		count++
		var p struct {
			Items []any `json:"items"`
		}
		data, _ := json.Marshal(m.Payload)
		_ = json.Unmarshal(data, &p)
		rows += len(p.Items)
		if !*m.Final {
			task.ack <- *m.Sequence
		}
		return nil
	})
	if e != nil || rows != 50 || count != 3 {
		t.Fatalf("%v rows=%d frames=%d", e, rows, count)
	}
}
