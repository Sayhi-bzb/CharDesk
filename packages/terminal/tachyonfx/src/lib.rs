use ratatui_core::{buffer::Buffer, layout::Rect, style::Color};
use std::{cell::RefCell, collections::BTreeMap};
use tachyonfx::{fx, pattern::SweepPattern, Duration, Effect};

struct Pulse {
    effect: Effect,
    buffer: Buffer,
    tail: Option<(Effect, Buffer)>,
}
struct Effects {
    next: u32,
    pulses: BTreeMap<u32, Pulse>,
}
thread_local! {
    static EFFECTS: RefCell<Effects> = RefCell::new(Effects { next: 1, pulses: BTreeMap::new() });
}

#[no_mangle]
pub extern "C" fn tachyonfx_version() -> u32 {
    25_002
}

#[no_mangle]
pub extern "C" fn read_new() -> u32 {
    EFFECTS.with(|state| {
        let mut state = state.borrow_mut();
        if state.pulses.len() >= 8 {
            return 0;
        }
        let id = state.next;
        state.next = state.next.checked_add(1).unwrap_or(1);
        let effect = fx::sequence(&[
            fx::fade_to_fg(Color::White, 180),
            fx::prolong_start(280, fx::fade_from_fg(Color::White, 740)),
        ]);
        state.pulses.insert(
            id,
            Pulse {
                effect,
                buffer: Buffer::empty(Rect::new(0, 0, 1, 1)),
                tail: None,
            },
        );
        id
    })
}

#[no_mangle]
pub extern "C" fn write_new(units: u32, milliseconds: u32) -> u32 {
    if units == 0 || units > 4096 || milliseconds == 0 || milliseconds > 15_000 {
        return 0;
    }
    EFFECTS.with(|state| {
        let mut state = state.borrow_mut();
        if state.pulses.len() >= 8 {
            return 0;
        }
        let id = state.next;
        state.next = state.next.checked_add(1).unwrap_or(1);
        let area = Rect::new(0, 0, units as u16, 1);
        state.pulses.insert(
            id,
            Pulse {
                effect: fx::fade_to_fg(Color::White, milliseconds)
                    .with_pattern(SweepPattern::left_to_right(1)),
                buffer: Buffer::empty(area),
                tail: Some((
                    fx::fade_to_fg(Color::White, milliseconds + 700)
                        .with_pattern(SweepPattern::left_to_right(12)),
                    Buffer::empty(area),
                )),
            },
        );
        id
    })
}

#[no_mangle]
pub extern "C" fn write_tick(id: u32, milliseconds: u32) -> i32 {
    EFFECTS.with(|state| {
        let mut state = state.borrow_mut();
        let Some(pulse) = state.pulses.get_mut(&id) else {
            return -1;
        };
        let duration = Duration::from_millis(milliseconds.min(60_000));
        let area = pulse.buffer.area;
        for x in 0..area.width {
            pulse.buffer[(x, 0)].set_fg(Color::Black);
        }
        pulse.effect.process(duration, &mut pulse.buffer, area);
        let mut complete = pulse.effect.done();
        if let Some((effect, buffer)) = &mut pulse.tail {
            for x in 0..area.width {
                buffer[(x, 0)].set_fg(Color::Black);
            }
            effect.process(duration, buffer, area);
            complete &= effect.done();
        }
        if complete {
            state.pulses.remove(&id);
            return -1;
        }
        (0..area.width)
            .take_while(|&x| brightness(pulse.buffer[(x, 0)].fg) >= 0.5)
            .count() as i32
    })
}

fn brightness(color: Color) -> f32 {
    match color {
        Color::Rgb(red, _, _) => red as f32 / 255.0,
        Color::White => 1.0,
        _ => 0.0,
    }
}

#[no_mangle]
pub extern "C" fn write_tail(id: u32, index: u32) -> f32 {
    EFFECTS.with(|state| {
        let state = state.borrow();
        let Some(pulse) = state.pulses.get(&id) else {
            return 0.0;
        };
        if index >= pulse.buffer.area.width as u32 {
            return 0.0;
        }
        let x = index as u16;
        if brightness(pulse.buffer[(x, 0)].fg) < 0.5 {
            return 0.0;
        }
        pulse
            .tail
            .as_ref()
            .map_or(0.0, |(_, buffer)| 1.0 - brightness(buffer[(x, 0)].fg))
    })
}

#[no_mangle]
pub extern "C" fn read_tick(id: u32, milliseconds: u32) -> f32 {
    EFFECTS.with(|state| {
        let mut state = state.borrow_mut();
        let Some(pulse) = state.pulses.get_mut(&id) else {
            return -1.0;
        };
        pulse.buffer[(0, 0)].set_fg(Color::Black);
        pulse.effect.process(
            Duration::from_millis(milliseconds.min(60_000)),
            &mut pulse.buffer,
            Rect::new(0, 0, 1, 1),
        );
        if pulse.effect.done() {
            state.pulses.remove(&id);
            return -1.0;
        }
        match pulse.buffer[(0, 0)].fg {
            Color::Rgb(red, _, _) => red as f32 / 255.0,
            Color::White => 1.0,
            _ => 0.0,
        }
    })
}

#[no_mangle]
pub extern "C" fn effect_drop(id: u32) {
    EFFECTS.with(|state| {
        state.borrow_mut().pulses.remove(&id);
    });
}

#[no_mangle]
pub extern "C" fn effect_count() -> u32 {
    EFFECTS.with(|state| state.borrow().pulses.len() as u32)
}
