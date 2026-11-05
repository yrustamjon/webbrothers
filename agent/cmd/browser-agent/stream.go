package main

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"webbrothers/agent/internal/protocol"
)

type streamTask struct {
	ctx     context.Context
	cancel  context.CancelFunc
	ack     chan int
	mu      sync.Mutex
	waiting int
	next    int
}
type taskGroup struct {
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.Mutex
	tasks  map[string]*streamTask
	wg     sync.WaitGroup
	limit  int
}

func newTaskGroup(ctx context.Context, limit int) *taskGroup {
	ctx, cancel := context.WithCancel(ctx)
	return &taskGroup{ctx: ctx, cancel: cancel, tasks: map[string]*streamTask{}, limit: limit}
}
func (g *taskGroup) start(m protocol.Message, job func(*streamTask)) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ctx.Err() != nil {
		return g.ctx.Err()
	}
	if len(g.tasks) >= g.limit {
		return errors.New("Qurilma band; soʻrovni keyinroq takrorlang")
	}
	if _, exists := g.tasks[m.RequestID]; exists {
		return errors.New("Takroriy soʻrov")
	}
	ctx, cancel := context.WithDeadline(g.ctx, m.ExpiresAt)
	t := &streamTask{ctx: ctx, cancel: cancel, ack: make(chan int, 1), waiting: -1}
	g.tasks[m.RequestID] = t
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		defer cancel()
		defer func() { g.mu.Lock(); delete(g.tasks, m.RequestID); g.mu.Unlock() }()
		job(t)
	}()
	return nil
}
func (g *taskGroup) control(m protocol.Message) error {
	g.mu.Lock()
	t := g.tasks[m.RequestID]
	g.mu.Unlock()
	if t == nil {
		return nil
	}
	if m.Type == "CANCEL_REQUEST" {
		t.cancel()
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if m.Sequence == nil || *m.Sequence != t.waiting {
		return errors.New("Kutilmagan ACK")
	}
	select {
	case t.ack <- *m.Sequence:
	default:
	}
	return nil
}
func (g *taskGroup) close() {
	g.cancel()
	g.mu.Lock()
	for _, t := range g.tasks {
		t.cancel()
	}
	g.mu.Unlock()
	g.wg.Wait()
}

func (t *streamTask) send(m protocol.Message, seq int, final bool, payload any, send func(any) error) error {
	if err := t.ctx.Err(); err != nil {
		return err
	}
	m.Params = nil
	m.Payload = payload
	m.Sequence = &seq
	m.Final = &final
	encoded, err := json.Marshal(m)
	if err != nil || len(encoded) > protocol.MaxStreamFrame {
		return errors.New("Stream boʻlagi juda katta")
	}
	t.mu.Lock()
	t.waiting = seq
	t.mu.Unlock()
	if err := send(m); err != nil {
		return err
	}
	if final {
		t.mu.Lock()
		t.next = seq + 1
		t.mu.Unlock()
		return nil
	}
	select {
	case ack := <-t.ack:
		if ack != seq {
			return errors.New("ACK ketma-ketligi notoʻgʻri")
		}
	case <-t.ctx.Done():
		return t.ctx.Err()
	}
	t.mu.Lock()
	t.waiting = -1
	t.next = seq + 1
	t.mu.Unlock()
	return nil
}

func streamPages(t *streamTask, m protocol.Message, payload any, send func(any) error) error {
	raw, err := json.Marshal(payload)
	if err != nil || len(raw) > protocol.MaxPayload {
		return errors.New("Sahifa juda katta")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	var items []json.RawMessage
	if err := json.Unmarshal(fields["items"], &items); err != nil {
		return err
	}
	delete(fields, "items")
	m.Type = protocol.Responses[m.Type]
	seq := 0
	for offset := 0; offset < len(items) || offset == 0; {
		end := offset
		var page map[string]json.RawMessage
		for end < len(items) {
			candidate := make(map[string]json.RawMessage, len(fields)+1)
			for k, v := range fields {
				candidate[k] = v
			}
			candidate["items"], _ = json.Marshal(items[offset : end+1])
			test := m
			test.Params = nil
			test.Payload = candidate
			test.Sequence = &seq
			f := false
			test.Final = &f
			encoded, e := json.Marshal(test)
			if e != nil {
				return e
			}
			if len(encoded) > protocol.MaxStreamFrame {
				break
			}
			page = candidate
			end++
			if end-offset == 20 {
				break
			}
		}
		if end == offset && len(items) > 0 {
			return errors.New("Bitta yozuv stream chegarasidan katta")
		}
		if page == nil {
			page = make(map[string]json.RawMessage, len(fields)+1)
			for k, v := range fields {
				page[k] = v
			}
			page["items"] = json.RawMessage("[]")
		}
		final := end == len(items)
		if err := t.send(m, seq, final, page, send); err != nil {
			return err
		}
		if final {
			return nil
		}
		offset = end
		seq++
	}
	return nil
}

func (t *streamTask) nextSequence() int { t.mu.Lock(); defer t.mu.Unlock(); return t.next }
