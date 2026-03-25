// Clean constellation background animation
const canvas = document.getElementById("constellation-canvas");
const ctx = canvas.getContext("2d");

let cw = window.innerWidth,
    ch = window.innerHeight,
    particles = [];

canvas.width = cw;
canvas.height = ch;

window.addEventListener("resize", function() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw;
    canvas.height = ch;
});

class Particle {
    constructor() {
        this.x = Math.random() * cw;
        this.y = Math.random() * ch;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.radius = Math.random() * 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > cw) this.vx *= -1;
        if (this.y < 0 || this.y > ch) this.vy *= -1;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.6)"; 
        ctx.fill();
    }
}

function init() {
    particles = [];
    const particleCount = (cw * ch) / 10000;
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, cw, ch);

    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 100) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(59, 130, 246, ${0.2 - dist/500})`;
                ctx.lineWidth = 1;
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
}

init();
animate();
